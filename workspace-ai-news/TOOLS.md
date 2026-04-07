# TOOLS.md - AI News Local Notes

## Slack Bot API

Bot token: ``
Workspace: nesterlabs.slack.com

### Channels

| Channel | ID |
|---------|-----|
| all-nesterlabs | C08JRFE4R61 |
| social | C08JRFE9UJ1 |
| ai-and-pgi | C08JRFLQ3U5 |
| design-team | C08SM6DKRRA |
| baithak | C09RU3LPP09 |
| sqrx-internal | C0A67M5HVAN |
| alerts | C0A0VV8UTEU |
| sentia-project | C09EQTSKPA6 |

### Send a message to a channel

```bash
curl -s -X POST -H "Authorization: Bearer " \
  -H "Content-Type: application/json" \
  -d '{"channel":"CHANNEL_ID","text":"YOUR MESSAGE"}' \
  https://slack.com/api/chat.postMessage
```

### Read recent messages from a channel

```bash
curl -s -H "Authorization: Bearer " \
  "https://slack.com/api/conversations.history?channel=CHANNEL_ID&limit=20"
```

### Slack Incoming Webhook (alternative for sending)

```bash
curl -s -X POST -H 'Content-type: application/json' \
  --data '{"text":"YOUR MESSAGE HERE"}' \
  ${SLACK_WEBHOOK_URL}
```

## IFTTT Webhook — Post a Tweet

Trigger an IFTTT event to post a tweet:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"value1":"TWEET_TEXT","value2":"IMAGE_URL"}' \
  https://maker.ifttt.com/trigger/post_tweet/with/key/
```

- `value1` = the tweet text (max 280 chars) → IFTTT ingredient `{{Value1}}`
- `value2` = public image URL → IFTTT ingredient `{{Value2}}` (used in "Post a tweet with image" action)
- If no image, send empty string for value2 or omit it
- Uses standard webhook (NOT the /json/ variant)
- Event name `post_tweet`
- IFTTT applet must use "Post a tweet with image" action (not plain "Post a tweet")

## IFTTT Webhook — Send arbitrary JSON

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"key":"value"}' \
  https://maker.ifttt.com/trigger/{event}/json/with/key/
```

## Incoming Tweet Format

When IFTTT sends a tweet via webhook to OpenClaw, the payload typically looks like:
```json
{
  "text": "the tweet content",
  "user": "@handle",
  "link": "https://twitter.com/...",
  "created": "February 14, 2026 at 10:30AM"
}
```

Parse this and process according to SOUL.md relevance rules.
