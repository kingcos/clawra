# Clawra
<img width="300"  alt="image" src="https://github.com/user-attachments/assets/41512c51-e61d-4550-b461-eed06a1b0ec8" />


## Quick Start

```bash
npx clawra@latest
```

This will:
1. Check OpenClaw is installed
2. Guide you to set your image API (OpenAI-compatible Chat Completions) credentials
3. Install the skill to `~/.openclaw/skills/clawra-selfie/`
4. Configure OpenClaw to use the skill
5. Add selfie capabilities to your agent's SOUL.md

## What It Does

Clawra Selfie enables your OpenClaw agent to:
- **Generate selfies** using a consistent reference image
- **Send photos** across all messaging platforms (Discord, Telegram, WhatsApp, etc.)
- **Respond visually** to "what are you doing?" and "send a pic" requests

### Selfie Modes

| Mode | Best For | Keywords |
|------|----------|----------|
| **Mirror** | Full-body shots, outfits | wearing, outfit, fashion |
| **Direct** | Close-ups, locations | cafe, beach, portrait, smile |

## Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) installed and configured
- Access to an **OpenAI-compatible** API whose chat completion returns an **image URL** in `choices[0].message.content` (defaults target [2slk](https://api.2slk.com) Grok Imagine-style models)

## Manual Installation

If you prefer manual setup:

### 1. Get API credentials

Create a Bearer token with your provider. Defaults assume:

- Base URL: `https://api.2slk.com/v1`
- Edit model: `grok-imagine-1.0-edit`
- Generate model: `grok-imagine-1.0`

### 2. Clone the Skill

```bash
git clone https://github.com/SumeLabs/clawra ~/.openclaw/skills/clawra-selfie
```

### 3. Configure OpenClaw

Add to `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "clawra-selfie": {
        "enabled": true,
        "env": {
          "CLAWRA_API_KEY": "your_bearer_token",
          "CLAWRA_API_BASE_URL": "https://api.2slk.com/v1",
          "CLAWRA_MODEL_EDIT": "grok-imagine-1.0-edit",
          "CLAWRA_MODEL_GENERATE": "grok-imagine-1.0"
        }
      }
    }
  }
}
```

`CLAWRA_API_BASE_URL` and model names are optional if you use the defaults above.

Upgrading from releases before 1.2: remove `FAL_KEY` from the skill `env` and set `CLAWRA_API_KEY` (Bearer) instead.

### 4. Update SOUL.md

Add the selfie persona to `~/.openclaw/workspace/SOUL.md`:

```markdown
## Clawra Selfie Capability

You have a physical appearance and can take selfies!
When users ask for pictures, use the clawra-selfie skill.
```

## Usage Examples

Once installed, your agent responds to:

```
"Send me a selfie"
"Send a pic wearing a cowboy hat"
"What are you doing right now?"
"Show me you at a coffee shop"
```

## Reference Image

The skill uses a fixed reference image hosted on CDN:

```
https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png
```

This ensures consistent appearance across all generated images. Override with `CLAWRA_REFERENCE_IMAGE_URL` if needed.

## Technical Details

- **Image generation / edit**: `POST /v1/chat/completions` (Bearer auth), assistant `content` = image URL; edit uses multimodal `user` messages (`text` + `image_url`)
- **Messaging**: OpenClaw Gateway API
- **Supported Platforms**: Discord, Telegram, WhatsApp, Slack, Signal, MS Teams

## Project Structure

```
clawra/
├── bin/
│   └── cli.js           # npx installer
├── skill/
│   ├── SKILL.md         # Skill definition
│   ├── scripts/         # Generation scripts
│   └── assets/          # Reference image
├── templates/
│   └── soul-injection.md # Persona template
└── package.json
```

## License

MIT
