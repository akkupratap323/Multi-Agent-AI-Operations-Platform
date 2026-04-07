import os
import json
import subprocess

slack_token = os.environ.get('SLACK_BOT_TOKEN', '')
channel_id = "C0A0VV8UTEU"
message_text = """*Daily Standup — Thursday, March 19th*

Yo team, Rex here. Here's your morning status check.

---

*Aditya (Terrorizer-AI)*
• In Progress: Looks like Aditya bhai has a couple of PRs chilling. "feat: log user/bot transcripts to CloudWatch Logs per session" (#49) from March 12th is waiting for a look, and the "Upgrade pipecat 0.0.100" (#36) from way back in Feb 11th is still hanging around. Needs some review love, yarr!

*Ayush (ayushnesterlabs)*
• In Progress: Ayush's "implemented semantic search and templates" (#16) PR has been open since Feb 3rd. That's kinda sus, let's get that reviewed or closed, bro.

*Shrey, Asha, Abhijith, Susaant, Sneha, Ankur, Lohita, Gaurav, Kunal, John*
• No new updates on GitHub for the squad today, but always remember to ping me if you're working on something that doesn't hit the repos directly!

---

*Build & Deploy Status*
All pipelines green since March 16th. We're shipping clean today, no explosions yet!

*Open Items*
• 3 open PRs across the team (2 waiting review for more than 2 days — lowkey stale, especially Ayush's and one of Aditya's)
• No P0/P1 issues open right now, let's keep it that way!

*Today's Priorities*
1. Let's get eyes on Aditya's CloudWatch logging PR (#49) for `NesterAIBot`. Super important for debugging, yarr.
2. We gotta untangle Ayush's semantic search PR (#16) and Aditya's old pipecat upgrade (#36). Let's decide if they need a fresh look or if we're moving on.
3. Keep those CI pipelines green, team! No surprise breaks.

*Blockers*
• No blockers today. Clean sprint energy!"""

payload = {
    "channel": channel_id,
    "text": message_text
}

headers = {
    "Authorization": f"Bearer {slack_token}",
    "Content-Type": "application/json"
}

command = [
    "curl",
    "-s",
    "-X", "POST",
    "-H", f"Authorization: Bearer {slack_token}",
    "-H", "Content-Type: application/json",
    "-d", json.dumps(payload),
    "https://slack.com/api/chat.postMessage"
]

try:
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    print(result.stdout)
except subprocess.CalledProcessError as e:
    print(f"Error: {e}")
    print(f"Stdout: {e.stdout}")
    print(f"Stderr: {e.stderr}")
