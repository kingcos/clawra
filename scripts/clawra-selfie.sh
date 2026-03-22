#!/bin/bash
# clawra-selfie.sh — text-to-image via OpenAI-compatible Chat Completions, then OpenClaw
#
# Usage: ./clawra-selfie.sh "<prompt>" "<channel>" ["<caption>"]
#
# Environment:
#   CLAWRA_API_KEY           — Bearer token (required)
#   CLAWRA_API_BASE_URL      — default https://api.2slk.com/v1
#   CLAWRA_MODEL_GENERATE    — default grok-imagine-1.0
#   CLAWRA_TEMPERATURE       — default 0.7
#
# Example:
#   CLAWRA_API_KEY=sk-... ./clawra-selfie.sh "A sunset over mountains" "#art" "Check this out!"

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

if [ -z "${CLAWRA_API_KEY:-}" ]; then
    log_error "CLAWRA_API_KEY environment variable not set"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    log_error "jq is required but not installed"
    echo "Install with: brew install jq (macOS) or apt install jq (Linux)"
    exit 1
fi

if ! command -v openclaw &> /dev/null; then
    log_warn "openclaw CLI not found - will attempt direct API call"
    USE_CLI=false
else
    USE_CLI=true
fi

API_BASE="${CLAWRA_API_BASE_URL:-https://api.2slk.com/v1}"
API_BASE="${API_BASE%/}"
MODEL="${CLAWRA_MODEL_GENERATE:-grok-imagine-1.0}"
TEMP="${CLAWRA_TEMPERATURE:-0.7}"

PROMPT="${1:-}"
CHANNEL="${2:-}"
CAPTION="${3:-Generated with Grok Imagine}"

if [ -z "$PROMPT" ] || [ -z "$CHANNEL" ]; then
    echo "Usage: $0 <prompt> <channel> [caption]"
    echo ""
    echo "Environment: CLAWRA_API_KEY (required), CLAWRA_API_BASE_URL, CLAWRA_MODEL_GENERATE, CLAWRA_TEMPERATURE"
    exit 1
fi

log_info "Generating image via Chat Completions..."
log_info "Prompt: $PROMPT"

REQUEST_BODY=$(jq -n \
  --arg model "$MODEL" \
  --arg prompt "$PROMPT" \
  --arg temp "$TEMP" \
  '{model: $model, messages: [{role: "user", content: $prompt}], temperature: ($temp | tonumber)}')

RESPONSE=$(curl -s -X POST "${API_BASE}/chat/completions" \
    -H "Authorization: Bearer ${CLAWRA_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$REQUEST_BODY")

if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error.message // .error // "Unknown error"')
    log_error "Image generation failed: $ERROR_MSG"
    exit 1
fi

RAW_CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // empty')
IMAGE_URL=$(echo "$RAW_CONTENT" | awk 'NF {print $1; exit}' | sed 's/[.,;:)]*$//')

if [[ ! "$IMAGE_URL" =~ ^https?:// ]]; then
    IMAGE_URL=$(echo "$RAW_CONTENT" | grep -oE 'https?://[^[:space:]"'\''<>)]+' | head -1 | sed 's/[.,;:)]*$//')
fi

if [ -z "$IMAGE_URL" ]; then
    log_error "Failed to extract image URL from response"
    echo "Response: $RESPONSE"
    exit 1
fi

log_info "Image generated successfully!"
log_info "URL: $IMAGE_URL"

log_info "Sending to channel: $CHANNEL"

if [ "$USE_CLI" = true ]; then
    openclaw message send \
        --action send \
        --channel "$CHANNEL" \
        --message "$CAPTION" \
        --media "$IMAGE_URL"
else
    GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://localhost:18789}"
    GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"

    curl -s -X POST "$GATEWAY_URL/message" \
        -H "Content-Type: application/json" \
        ${GATEWAY_TOKEN:+-H "Authorization: Bearer $GATEWAY_TOKEN"} \
        -d "{
            \"action\": \"send\",
            \"channel\": \"$CHANNEL\",
            \"message\": \"$CAPTION\",
            \"media\": \"$IMAGE_URL\"
        }"
fi

log_info "Done! Image sent to $CHANNEL"

echo ""
echo "--- Result ---"
jq -n \
    --arg url "$IMAGE_URL" \
    --arg channel "$CHANNEL" \
    --arg prompt "$PROMPT" \
    '{
        success: true,
        image_url: $url,
        channel: $channel,
        prompt: $prompt
    }'
