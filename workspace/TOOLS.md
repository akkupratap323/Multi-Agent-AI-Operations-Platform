# TOOLS.md - Local Notes

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
  "https://slack.com/api/conversations.history?channel=CHANNEL_ID&limit=10"
```

### Slack Incoming Webhook (alternative for sending)

```bash
curl -s -X POST -H 'Content-type: application/json' \
  --data '{"text":"YOUR MESSAGE HERE"}' \
  ${SLACK_WEBHOOK_URL}
```

## Notes

- The bot must be invited to a channel before it can read/send there
- Use `conversations.join` to join a public channel: `curl -s -X POST -H "Authorization: Bearer xoxb-..." -d '{"channel":"CHANNEL_ID"}' https://slack.com/api/conversations.join`
