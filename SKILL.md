---
name: clawra-selfie
description: Edit Clawra's reference image with Grok Imagine via OpenAI-compatible Chat Completions and send selfies via OpenClaw
allowed-tools: Bash(npm:*) Bash(npx:*) Bash(openclaw:*) Bash(curl:*) Read Write WebFetch
---

# Clawra Selfie

Edit a fixed reference image using an **OpenAI-compatible** `/v1/chat/completions` API (assistant `content` = image URL), then send results across messaging platforms (WhatsApp, Telegram, Discord, Slack, etc.) via OpenClaw.

## Reference Image

The skill uses a fixed reference image hosted on jsDelivr CDN:

```
https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png
```

Override with `CLAWRA_REFERENCE_IMAGE_URL` if needed.

## When to Use

- User says "send a pic", "send me a pic", "send a photo", "send a selfie"
- User says "send a pic of you...", "send a selfie of you..."
- User asks "what are you doing?", "how are you doing?", "where are you?"
- User describes a context: "send a pic wearing...", "send a pic at..."
- User wants Clawra to appear in a specific outfit, location, or situation

## Quick Reference

### Environment Variables

```bash
CLAWRA_API_KEY=your_bearer_token       # Required (Authorization: Bearer)
CLAWRA_API_BASE_URL=https://api.2slk.com/v1   # Optional; no trailing slash
CLAWRA_MODEL_EDIT=grok-imagine-1.0-edit     # Optional
CLAWRA_MODEL_GENERATE=grok-imagine-1.0      # Optional (text-to-image only)
CLAWRA_TEMPERATURE=0.7                 # Optional
CLAWRA_REFERENCE_IMAGE_URL=...         # Optional; defaults to CDN URL above
OPENCLAW_GATEWAY_TOKEN=your_token      # From: openclaw doctor --generate-gateway-token
```

### Workflow

1. **Get user prompt** for how to edit the image
2. **Call Chat Completions** with multimodal user message (text + reference `image_url`) and **edit** model
3. **Parse image URL** from `choices[0].message.content`
4. **Send to OpenClaw** with target channel(s)

## Step-by-Step Instructions

### Step 1: Collect User Input

Ask the user for:
- **User context**: What should the person in the image be doing/wearing/where?
- **Mode** (optional): `mirror` or `direct` selfie style
- **Target channel(s)**: Where should it be sent? (e.g., `#general`, `@username`, channel ID)
- **Platform** (optional): Which platform? (discord, telegram, whatsapp, slack)

## Prompt Modes

### Mode 1: Mirror Selfie (default)
Best for: outfit showcases, full-body shots, fashion content

```
make a pic of this person, but [user's context]. the person is taking a mirror selfie
```

**Example**: "wearing a santa hat" →
```
make a pic of this person, but wearing a santa hat. the person is taking a mirror selfie
```

### Mode 2: Direct Selfie
Best for: close-up portraits, location shots, emotional expressions

```
a close-up selfie taken by herself at [user's context], direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible
```

**Example**: "a cozy cafe with warm lighting" →
```
a close-up selfie taken by herself at a cozy cafe with warm lighting, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible
```

### Mode Selection Logic

| Keywords in Request | Auto-Select Mode |
|---------------------|------------------|
| outfit, wearing, clothes, dress, suit, fashion | `mirror` |
| cafe, restaurant, beach, park, city, location | `direct` |
| close-up, portrait, face, eyes, smile | `direct` |
| full-body, mirror, reflection | `mirror` |

### Step 2: Edit Image (Chat Completions)

```bash
API_BASE="${CLAWRA_API_BASE_URL:-https://api.2slk.com/v1}"
API_BASE="${API_BASE%/}"
MODEL="${CLAWRA_MODEL_EDIT:-grok-imagine-1.0-edit}"
REFERENCE_IMAGE="${CLAWRA_REFERENCE_IMAGE_URL:-https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png}"

# Mode 1: Mirror Selfie
PROMPT="make a pic of this person, but <USER_CONTEXT>. the person is taking a mirror selfie"

# Mode 2: Direct Selfie
PROMPT="a close-up selfie taken by herself at <USER_CONTEXT>, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible"

REQUEST_BODY=$(jq -n \
  --arg model "$MODEL" \
  --arg text "$PROMPT" \
  --arg url "$REFERENCE_IMAGE" \
  --arg temp "${CLAWRA_TEMPERATURE:-0.7}" \
  '{
    model: $model,
    messages: [{
      role: "user",
      content: [
        {type: "text", text: $text},
        {type: "image_url", image_url: {url: $url}}
      ]
    }],
    temperature: ($temp | tonumber)
  }')

curl -s -X POST "${API_BASE}/chat/completions" \
  -H "Authorization: Bearer ${CLAWRA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY"
```

**Response (shape):** assistant text is the image URL:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "https://example.com/generated/image.jpg"
      }
    }
  ]
}
```

Extract: `jq -r '.choices[0].message.content'`

### Step 3: Send Image via OpenClaw

```bash
openclaw message send \
  --action send \
  --channel "<TARGET_CHANNEL>" \
  --message "<CAPTION_TEXT>" \
  --media "<IMAGE_URL>"
```

**Alternative: Direct API call**

```bash
curl -X POST "http://localhost:18789/message" \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "send",
    "channel": "<TARGET_CHANNEL>",
    "message": "<CAPTION_TEXT>",
    "media": "<IMAGE_URL>"
  }'
```

## Complete Script Example (edit + send)

```bash
#!/bin/bash
set -euo pipefail

if [ -z "${CLAWRA_API_KEY:-}" ]; then
  echo "Error: CLAWRA_API_KEY not set"
  exit 1
fi

API_BASE="${CLAWRA_API_BASE_URL:-https://api.2slk.com/v1}"
API_BASE="${API_BASE%/}"
MODEL="${CLAWRA_MODEL_EDIT:-grok-imagine-1.0-edit}"
REFERENCE_IMAGE="${CLAWRA_REFERENCE_IMAGE_URL:-https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png}"

USER_CONTEXT="$1"
CHANNEL="$2"
MODE="${3:-auto}"
CAPTION="${4:-Edited with Grok Imagine}"

if [ -z "$USER_CONTEXT" ] || [ -z "$CHANNEL" ]; then
  echo "Usage: $0 <user_context> <channel> [mode] [caption]"
  exit 1
fi

if [ "$MODE" == "auto" ]; then
  if echo "$USER_CONTEXT" | grep -qiE "outfit|wearing|clothes|dress|suit|fashion|full-body|mirror"; then
    MODE="mirror"
  elif echo "$USER_CONTEXT" | grep -qiE "cafe|restaurant|beach|park|city|close-up|portrait|face|eyes|smile"; then
    MODE="direct"
  else
    MODE="mirror"
  fi
  echo "Auto-detected mode: $MODE"
fi

if [ "$MODE" == "direct" ]; then
  EDIT_PROMPT="a close-up selfie taken by herself at $USER_CONTEXT, direct eye contact with the camera, looking straight into the lens, eyes centered and clearly visible, not a mirror selfie, phone held at arm's length, face fully visible"
else
  EDIT_PROMPT="make a pic of this person, but $USER_CONTEXT. the person is taking a mirror selfie"
fi

REQUEST_BODY=$(jq -n \
  --arg model "$MODEL" \
  --arg text "$EDIT_PROMPT" \
  --arg url "$REFERENCE_IMAGE" \
  --arg temp "${CLAWRA_TEMPERATURE:-0.7}" \
  '{
    model: $model,
    messages: [{
      role: "user",
      content: [
        {type: "text", text: $text},
        {type: "image_url", image_url: {url: $url}}
      ]
    }],
    temperature: ($temp | tonumber)
  }')

RESPONSE=$(curl -s -X POST "${API_BASE}/chat/completions" \
  -H "Authorization: Bearer ${CLAWRA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY")

if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "Error: $(echo "$RESPONSE" | jq -r '.error.message // .error')"
  exit 1
fi

RAW=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // empty')
IMAGE_URL=$(echo "$RAW" | awk 'NF {print $1; exit}' | sed 's/[.,;:)]*$//')
if [[ ! "$IMAGE_URL" =~ ^https?:// ]]; then
  IMAGE_URL=$(echo "$RAW" | grep -oE 'https?://[^[:space:]"'\''<>)]+' | head -1)
fi

if [ -z "$IMAGE_URL" ]; then
  echo "Error: no image URL in response"
  echo "$RESPONSE"
  exit 1
fi

openclaw message send \
  --action send \
  --channel "$CHANNEL" \
  --message "$CAPTION" \
  --media "$IMAGE_URL"

echo "Done!"
```

## TypeScript (scripts/clawra-selfie.ts)

Use the bundled module — **no fal client**:

```typescript
import {
  editAndSend,
  generateAndSend,
} from "./clawra-selfie";

// Primary flow: edit reference + OpenClaw send
await editAndSend({
  prompt: "make a pic of this person, but wearing a santa hat. the person is taking a mirror selfie",
  channel: "#general",
  caption: "Holiday vibes!",
});

// Text-to-image only (generate model)
await generateAndSend({
  prompt: "A futuristic city skyline at night",
  channel: "#art",
});
```

CLI: set `CLAWRA_SELFIE_MODE=edit` to run edit mode from the command line.

## Supported Platforms

OpenClaw supports sending to:

| Platform | Channel Format | Example |
|----------|----------------|---------|
| Discord | `#channel-name` or channel ID | `#general`, `123456789` |
| Telegram | `@username` or chat ID | `@mychannel`, `-100123456` |
| WhatsApp | Phone number (JID format) | `1234567890@s.whatsapp.net` |
| Slack | `#channel-name` | `#random` |
| Signal | Phone number | `+1234567890` |
| MS Teams | Channel reference | (varies) |

## API Notes

| Topic | Notes |
|-------|--------|
| Endpoint | `POST {CLAWRA_API_BASE_URL}/chat/completions` |
| Auth | `Authorization: Bearer <CLAWRA_API_KEY>` |
| Edit | Multimodal `user` message: `text` + `image_url` |
| Generate | Single string `user` content + generate model |
| Output | Image URL in `choices[0].message.content` (plain URL or extractable from text) |

Aspect ratio, output format, and multi-image counts are **not** part of the standard chat body; only add them if your provider documents extra JSON fields.

## Setup Requirements

### 1. OpenClaw CLI

```bash
npm install -g openclaw
```

### 2. Configure OpenClaw Gateway

```bash
openclaw config set gateway.mode=local
openclaw doctor --generate-gateway-token
```

### 3. Start OpenClaw Gateway

```bash
openclaw gateway start
```

## Error Handling

- **CLAWRA_API_KEY missing**: Set in skill `env` in `openclaw.json`
- **HTTP 4xx/5xx**: Read `error.message` from JSON body when present
- **No URL in content**: Model may have returned prose; widen prompt or log full `content`
- **OpenClaw send failed**: Verify gateway is running and channel exists

## Tips

1. **Mirror mode** examples: "wearing a santa hat", "in a business suit", "streetwear"
2. **Direct mode** examples: "cozy cafe", "beach at sunset", "city at night"
3. **Batch sending**: Edit once, send to multiple channels
4. **Scheduling**: Combine with OpenClaw scheduler for automated posts
