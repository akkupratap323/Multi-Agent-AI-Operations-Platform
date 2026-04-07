#!/usr/bin/env bash
# ifttt-tweet-relay.sh
# Lightweight HTTP server that receives IFTTT tweet payloads
# and forwards them to the OpenClaw ai-news agent via CLI.
#
# Usage:
#   1. Start this relay:    bash ifttt-tweet-relay.sh
#   2. Expose port 9877:    ngrok http 9877   (or cloudflared tunnel)
#   3. Use the public URL as the IFTTT webhook action URL
#
# The relay reformats the IFTTT payload and triggers the ai-news agent
# via `openclaw agent --agent ai-news --message "..."`.

RELAY_PORT=${RELAY_PORT:-9877}
AGENT_ID="ai-news"

echo "IFTTT Tweet Relay starting on port $RELAY_PORT"
echo "Forwarding to OpenClaw agent: $AGENT_ID"
echo ""
echo "Expose this port with:  ngrok http $RELAY_PORT"
echo "Then use the ngrok URL as your IFTTT webhook action URL."
echo ""

python3 -u -c "
import http.server
import socketserver
import json
import subprocess
import sys
import threading
import re
import urllib.request
import urllib.error

import random

PORT = $RELAY_PORT
AGENT_ID = '$AGENT_ID'

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

# --- STOCK AI/TECH IMAGES for tweets without media ---
# Free Unsplash images (AI, tech, robotics, circuits, data)
STOCK_IMAGES = [
    'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800',  # AI brain
    'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800',  # AI face
    'https://images.unsplash.com/photo-1555255707-c07966088b7b?w=800',  # circuit board
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800',  # robot
    'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800',  # laptop glow
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',  # circuit macro
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800',  # cybersecurity
    'https://images.unsplash.com/photo-1593508512255-86ab42a8e620?w=800',  # VR headset
    'https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=800',  # neural network
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800',  # matrix code
    'https://images.unsplash.com/photo-1516110833967-0b5716ca1387?w=800',  # server rack
    'https://images.unsplash.com/photo-1580894894513-541e068a3e2b?w=800',  # tech abstract
    'https://images.unsplash.com/photo-1696258686454-60082b2c33e2?w=800',  # AI chip
]
_stock_idx = 0

def get_stock_image():
    \"\"\"Return next stock image URL (round-robin so no repeats until full cycle).\"\"\"
    global _stock_idx
    url = STOCK_IMAGES[_stock_idx % len(STOCK_IMAGES)]
    _stock_idx += 1
    return url

# --- PRE-FILTER: Only pass tweets that are actually about AI/tech/IT ---

# Must contain at least one of these keywords (case-insensitive)
REQUIRE_KEYWORDS = [
    # AI / ML core
    'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
    'large language model', 'LLM', 'GPT', 'ChatGPT', 'GPT-4', 'GPT-5',
    'transformer model', 'diffusion model', 'foundation model',
    'reinforcement learning', 'fine-tuning', 'fine tuning', 'RAG',
    'prompt engineering', 'AI agent', 'AI safety', 'AI alignment',
    'generative AI', 'gen AI', 'GenAI',
    # Companies / products
    'OpenAI', 'Anthropic', 'Claude', 'Google DeepMind', 'DeepMind',
    'Gemini', 'Meta AI', 'LLaMA', 'Llama', 'Mistral', 'Cohere',
    'Stability AI', 'Midjourney', 'DALL-E', 'DALLE', 'Sora',
    'Hugging Face', 'HuggingFace', 'NVIDIA', 'Jensen Huang',
    'Sam Altman', 'Dario Amodei', 'Demis Hassabis',
    'Perplexity', 'Cursor', 'Copilot', 'GitHub Copilot',
    # Voice AI / NLP
    'voice AI', 'speech synthesis', 'text to speech', 'TTS',
    'speech recognition', 'ASR', 'conversational AI', 'chatbot',
    'NLP', 'natural language processing',
    # Cloud / DevOps / Infra
    'cloud computing', 'AWS', 'Azure', 'GCP', 'Kubernetes', 'Docker',
    'serverless', 'microservices', 'MLOps', 'DevOps', 'CI/CD',
    'GPU cluster', 'TPU', 'inference', 'model serving',
    # Tech industry
    'AI startup', 'AI funding', 'Series A', 'Series B',
    'open source AI', 'AI regulation', 'AI policy', 'AI ethics',
    'AI research', 'research paper', 'arxiv', 'benchmark',
    'SOTA', 'state of the art',
    # Specific tech
    'computer vision', 'robotics', 'autonomous', 'self-driving',
    'AI chip', 'neural engine', 'edge AI', 'on-device AI',
    'vector database', 'embedding', 'tokenizer',
    'multimodal', 'vision language model', 'VLM',
    'code generation', 'AI coding', 'agentic',
]

# Drop tweets matching these patterns (spam, NSFW, crypto pump, etc.)
BLOCK_PATTERNS = [
    r'(?i)(onlyfans|nsfw|porn|xxx|nude|sexy|18\+)',
    r'(?i)(buy now|limited offer|airdrop|whitelist|presale|pump)',
    r'(?i)(follow me|follow back|f4f|follow for follow)',
    r'(?i)(dm me for|check my bio|link in bio)',
]

def looks_english(text):
    \"\"\"Quick check: reject tweets that are mostly non-Latin characters.\"\"\"
    if not text:
        return False
    latin = sum(1 for c in text if c.isascii() or c in '.,!?@#')
    total = max(len(text), 1)
    return (latin / total) > 0.7

# Short keywords that cause false positives — require word boundaries
SHORT_KEYWORDS = {'llm', 'gpt', 'nlp', 'rag', 'tts', 'asr', 'aws', 'gcp', 'tpu'}

def is_relevant(text):
    \"\"\"Pre-filter: returns True only if tweet is English AND about AI/tech/IT.\"\"\"
    if not text or len(text.strip()) < 30:
        return False
    # Must be mostly English
    if not looks_english(text):
        return False
    # Block spam/NSFW
    for pattern in BLOCK_PATTERNS:
        if re.search(pattern, text):
            return False
    # Require at least one tech keyword
    text_lower = text.lower()
    for kw in REQUIRE_KEYWORDS:
        kw_lower = kw.lower()
        if kw_lower in SHORT_KEYWORDS:
            # For short keywords, require word boundary match
            if re.search(r'\\b' + re.escape(kw_lower) + r'\\b', text_lower):
                return True
        else:
            if kw_lower in text_lower:
                return True
    return False

# Rate limiter: max N agent calls per minute
import time
MAX_PER_MINUTE = 2
call_timestamps = []

def rate_ok():
    now = time.time()
    # Remove timestamps older than 60s
    while call_timestamps and call_timestamps[0] < now - 60:
        call_timestamps.pop(0)
    if len(call_timestamps) < MAX_PER_MINUTE:
        call_timestamps.append(now)
        return True
    return False

# Stats
stats = {'received': 0, 'filtered_out': 0, 'dispatched': 0, 'rate_limited': 0}

def fetch_tweet_image(tweet_url):
    \"\"\"Try to get the tweet media image URL via vxtwitter API.\"\"\"
    if not tweet_url:
        return ''
    try:
        # Convert twitter.com/x.com URL to api.vxtwitter.com
        api_url = tweet_url
        api_url = api_url.replace('https://twitter.com/', 'https://api.vxtwitter.com/')
        api_url = api_url.replace('https://x.com/', 'https://api.vxtwitter.com/')
        if 'api.vxtwitter.com' not in api_url:
            return ''
        req = urllib.request.Request(api_url, headers={'User-Agent': 'NesterLabs-Relay/1.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            # vxtwitter returns media_extended array with URLs
            media = data.get('media_extended', data.get('mediaURLs', []))
            if isinstance(media, list) and media:
                first = media[0]
                if isinstance(first, dict):
                    url = first.get('url', '')
                elif isinstance(first, str):
                    url = first
                else:
                    url = ''
                if url and ('pbs.twimg.com' in url or url.endswith(('.jpg', '.png', '.jpeg', '.webp'))):
                    return url
            # Also check top-level mediaURLs
            media_urls = data.get('mediaURLs', [])
            if isinstance(media_urls, list) and media_urls:
                url = media_urls[0]
                if isinstance(url, str) and url:
                    return url
    except Exception as e:
        print(f'[IMG-FETCH] Could not fetch image from vxtwitter: {e}')
    return ''

def run_agent(message, user):
    \"\"\"Run openclaw agent in background thread.\"\"\"
    try:
        result = subprocess.run(
            ['openclaw', 'agent', '--agent', AGENT_ID, '--message', message],
            capture_output=True, text=True, timeout=300
        )
        if result.returncode == 0:
            print(f'[OK] Agent processed tweet from {user}')
        else:
            print(f'[WARN] Agent returned code {result.returncode} for tweet from {user}')
            if result.stderr:
                print(f'  stderr: {result.stderr[:200]}')
    except subprocess.TimeoutExpired:
        print(f'[TIMEOUT] Agent timed out processing tweet from {user}')
    except Exception as e:
        print(f'[ERROR] Agent failed for tweet from {user}: {e}')

class IFTTTRelayHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        try:
            tweet_data = json.loads(body)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'Invalid JSON')
            return

        # Log raw payload for debugging
        print(f'[RAW] Payload keys: {list(tweet_data.keys())}')

        # Extract tweet fields
        text = tweet_data.get('text', tweet_data.get('value1', ''))
        user = tweet_data.get('user', tweet_data.get('value2', 'unknown'))
        link = tweet_data.get('link', tweet_data.get('value3', ''))
        created = tweet_data.get('created', '')
        user_image = tweet_data.get('user_image', tweet_data.get('UserImageUrl', ''))
        embed_code = tweet_data.get('embed', tweet_data.get('TweetEmbedCode', ''))
        first_link = tweet_data.get('first_link', tweet_data.get('FirstLinkUrl', ''))

        # Extract tweet media image URL from embed code or other fields
        tweet_image = ''
        # Try to find pbs.twimg.com image URLs in the embed code
        if embed_code:
            img_match = re.search(r'https://pbs\.twimg\.com/media/[^\s\"\\'<>]+', embed_code)
            if img_match:
                tweet_image = img_match.group(0)
        # Also check if first_link is an image
        if not tweet_image and first_link:
            if any(ext in first_link.lower() for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
                tweet_image = first_link
            elif 'pbs.twimg.com' in first_link:
                tweet_image = first_link
        # Fallback: check all values in payload for twimg URLs
        if not tweet_image:
            for key, val in tweet_data.items():
                if isinstance(val, str) and 'pbs.twimg.com/media/' in val:
                    img_match = re.search(r'https://pbs\.twimg\.com/media/[^\s\"\\'<>]+', val)
                    if img_match:
                        tweet_image = img_match.group(0)
                        break

        # Fallback: fetch image from vxtwitter API using tweet link
        if not tweet_image and link:
            tweet_image = fetch_tweet_image(link)
            if tweet_image:
                print(f'[IMG-API] Fetched image via vxtwitter: {tweet_image[:100]}')

        # Final fallback: use a stock AI/tech image
        if not tweet_image:
            tweet_image = get_stock_image()
            print(f'[IMG-STOCK] Using stock image: {tweet_image[:80]}')
        else:
            print(f'[IMG] Tweet image URL: {tweet_image[:100]}')

        stats['received'] += 1

        # --- PRE-FILTER ---
        if not is_relevant(text):
            stats['filtered_out'] += 1
            print(f'[SKIP] Tweet from {user} — not relevant (filtered). Total: {stats[\"received\"]} recv, {stats[\"filtered_out\"]} filtered, {stats[\"dispatched\"]} sent')
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'OK - filtered out (not relevant)')
            return

        # --- RATE LIMIT ---
        if not rate_ok():
            stats['rate_limited'] += 1
            print(f'[RATE] Tweet from {user} — rate limited, skipping. Queue full.')
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'OK - rate limited, try later')
            return

        message = (
            f'Incoming tweet from IFTTT:\n\n'
            f'Author: {user}\n'
            f'Tweet: {text}\n'
            f'Link: {link}\n'
            f'Time: {created}\n'
            f'User Profile Image: {user_image}\n'
            f'Tweet Image URL: {tweet_image}\n'
            f'Embed Code: {embed_code}\n\n'
            f'Process this tweet according to SOUL.md rules. '
            f'If AUTO-POST worthy, compose and post via IFTTT webhook. '
            f'IMPORTANT: If \"Tweet Image URL\" is provided above, you MUST include it as value2 in the IFTTT webhook call. '
            f'If no tweet image URL is available, send an empty string for value2. '
            f'Send a Slack alert to the alerts channel. '
            f'If the tweet has images or media, use Slack blocks format with the image_url. '
            f'Log to memory.'
        )

        # Fire the agent in a background thread
        thread = threading.Thread(target=run_agent, args=(message, user))
        thread.daemon = True
        thread.start()

        stats['dispatched'] += 1
        print(f'[DISPATCH] Tweet from {user} — sent to agent. Total: {stats[\"received\"]} recv, {stats[\"filtered_out\"]} filtered, {stats[\"dispatched\"]} sent')

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'OK - tweet dispatched to ai-news agent')

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        msg = f'IFTTT Tweet Relay running. Stats: {stats[\"received\"]} received, {stats[\"filtered_out\"]} filtered, {stats[\"dispatched\"]} dispatched, {stats[\"rate_limited\"]} rate-limited'
        self.wfile.write(msg.encode())

    def log_message(self, format, *args):
        print(f'[{self.log_date_time_string()}] {format % args}')

print(f'IFTTT Tweet Relay listening on port {PORT}...')
print(f'Pre-filter: {len(REQUIRE_KEYWORDS)} keywords, {len(BLOCK_PATTERNS)} block patterns')
print(f'Rate limit: {MAX_PER_MINUTE} agent calls per minute')
server = ReusableTCPServer(('0.0.0.0', PORT), IFTTTRelayHandler)
server.serve_forever()
"
