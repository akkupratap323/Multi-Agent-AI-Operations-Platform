# MONITORS.md - Twitter Keywords & Accounts

## Keywords to Track (set up as IFTTT applets)

### High Priority
- NesterLabs
- nester labs
- nesterlabs
- NesterAIBot
- @NesterLabs (mentions)

### Medium Priority
- AI voice agent
- voice AI assistant
- pipecat framework
- pipecat AI
- RAG pipeline
- LLM agent infrastructure
- conversational AI platform

### Accounts to Watch
- (Add competitor Twitter handles here)
- (Add AI industry leader handles here)

## IFTTT Applet Setup

### Step 1: Start the relay
```bash
bash ~/.openclaw/workspace-ai-news/scripts/ifttt-tweet-relay.sh
```

### Step 2: Expose to internet
```bash
ngrok http 9877
# or
cloudflared tunnel --url http://localhost:9877
```
Copy the public HTTPS URL (e.g. `https://abc123.ngrok-free.app`).

### Step 3: Create IFTTT applets

For each keyword or account you want to monitor:

1. Go to https://ifttt.com/create
2. **IF THIS:** Choose "Twitter/X" → "New tweet from search" (for keywords) or "New tweet by a specific user" (for accounts)
3. Enter your keyword or @handle
4. **THEN THAT:** Choose "Webhooks" → "Make a web request"
5. Configure:
   - **URL:** `https://YOUR-NGROK-URL/` (paste your public URL from Step 2)
   - **Method:** POST
   - **Content Type:** application/json
   - **Body:**
     ```json
     {"text":"<<<{{Text}}>>>","user":"<<<{{UserName}}>>>","link":"<<<{{LinkToTweet}}>>>","created":"<<<{{CreatedAt}}>>>"}
     ```
6. Save and enable the applet

### Alternative: Direct IFTTT-to-IFTTT (for posting tweets)

To post tweets FROM OpenClaw, the agent uses this webhook (already configured in TOOLS.md):
```
https://maker.ifttt.com/trigger/post_tweet/with/key/
```

Create an IFTTT applet:
1. **IF THIS:** Webhooks → "Receive a web request" → Event name: `post_tweet`
2. **THEN THAT:** Twitter/X → "Post a tweet" → Tweet text: `{{Value1}}`
