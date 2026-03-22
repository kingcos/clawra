/**
 * Grok Imagine to OpenClaw Integration
 *
 * Calls an OpenAI-compatible Chat Completions API that returns an image URL
 * in the assistant message, then sends it via OpenClaw.
 *
 * Usage:
 *   npx ts-node clawra-selfie.ts "<prompt>" "<channel>" ["<caption>"]
 *
 * Environment:
 *   CLAWRA_API_KEY              — Bearer token (required)
 *   CLAWRA_API_BASE_URL         — default https://api.2slk.com/v1
 *   CLAWRA_MODEL_GENERATE       — default grok-imagine-1.0
 *   CLAWRA_MODEL_EDIT           — default grok-imagine-1.0-edit
 *   CLAWRA_TEMPERATURE          — default 0.7
 *   CLAWRA_REFERENCE_IMAGE_URL    — optional override for edit reference image
 *   OPENCLAW_GATEWAY_URL        — default http://localhost:18789
 *   OPENCLAW_GATEWAY_TOKEN      — optional
 */

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const DEFAULT_REFERENCE_IMAGE =
  "https://cdn.jsdelivr.net/gh/SumeLabs/clawra@main/assets/clawra.png";

export interface OpenClawMessage {
  action: "send";
  channel: string;
  message: string;
  media?: string;
}

interface GenerateImageResult {
  imageUrl: string;
}

interface EditImageResult {
  imageUrl: string;
}

export interface GenerateAndSendOptions {
  prompt: string;
  channel: string;
  caption?: string;
  useClaudeCodeCLI?: boolean;
}

export interface EditAndSendOptions {
  prompt: string;
  channel: string;
  caption?: string;
  referenceImageUrl?: string;
  useClaudeCodeCLI?: boolean;
}

export interface Result {
  success: boolean;
  imageUrl: string;
  channel: string;
  prompt: string;
}

function getApiBaseUrl(): string {
  const raw = process.env.CLAWRA_API_BASE_URL || "https://api.2slk.com/v1";
  return raw.replace(/\/$/, "");
}

function requireApiKey(): string {
  const key = process.env.CLAWRA_API_KEY;
  if (!key) {
    throw new Error(
      "CLAWRA_API_KEY is not set. Set your provider Bearer token in the environment."
    );
  }
  return key;
}

function getTemperature(): number {
  const t = parseFloat(process.env.CLAWRA_TEMPERATURE || "0.7");
  return Number.isFinite(t) ? t : 0.7;
}

/**
 * Parse image URL from assistant message content (plain URL or embedded in text).
 */
export function extractImageUrlFromContent(content: string): string {
  const trimmed = content.trim();
  const firstToken = trimmed.split(/\s+/)[0]?.replace(/[.,;:)]+$/, "") || "";
  if (/^https?:\/\//i.test(firstToken)) {
    return firstToken;
  }
  const m = content.match(/https?:\/\/[^\s"'<>\])]+/i);
  if (m) {
    return m[0].replace(/[.,;:)]+$/, "");
  }
  throw new Error("No image URL found in model response");
}

async function chatCompletions(
  model: string,
  messages: Array<Record<string, unknown>>
): Promise<string> {
  const apiKey = requireApiKey();
  const url = `${getApiBaseUrl()}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: getTemperature(),
    }),
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // ignore
  }

  if (!response.ok) {
    const err = data.error as Record<string, unknown> | string | undefined;
    const msg =
      typeof err === "object" && err && "message" in err
        ? String(err.message)
        : typeof err === "string"
          ? err
          : JSON.stringify(data);
    throw new Error(`Image API error (${response.status}): ${msg}`);
  }

  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  const content = message?.content;

  if (typeof content !== "string") {
    throw new Error("Unexpected API response: missing choices[0].message.content");
  }

  return content;
}

/**
 * Text-to-image: single user message with text prompt.
 */
export async function generateImage(input: {
  prompt: string;
}): Promise<GenerateImageResult> {
  const model = process.env.CLAWRA_MODEL_GENERATE || "grok-imagine-1.0";
  const content = await chatCompletions(model, [
    { role: "user", content: input.prompt },
  ]);
  return { imageUrl: extractImageUrlFromContent(content) };
}

/**
 * Edit reference image: multimodal user message (text + image_url).
 */
export async function editReferenceImage(input: {
  prompt: string;
  imageUrl: string;
}): Promise<EditImageResult> {
  const model = process.env.CLAWRA_MODEL_EDIT || "grok-imagine-1.0-edit";
  const content = await chatCompletions(model, [
    {
      role: "user",
      content: [
        { type: "text", text: input.prompt },
        { type: "image_url", image_url: { url: input.imageUrl } },
      ],
    },
  ]);
  return { imageUrl: extractImageUrlFromContent(content) };
}

/**
 * Send image via OpenClaw
 */
export async function sendViaOpenClaw(
  message: OpenClawMessage,
  useCLI: boolean = true
): Promise<void> {
  if (useCLI) {
    const cmd = `openclaw message send --action send --channel "${message.channel}" --message "${message.message}" --media "${message.media}"`;
    await execAsync(cmd);
    return;
  }

  const gatewayUrl =
    process.env.OPENCLAW_GATEWAY_URL || "http://localhost:18789";
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (gatewayToken) {
    headers["Authorization"] = `Bearer ${gatewayToken}`;
  }

  const response = await fetch(`${gatewayUrl}/message`, {
    method: "POST",
    headers,
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenClaw send failed: ${error}`);
  }
}

/**
 * Generate image from text and send to channel.
 */
export async function generateAndSend(
  options: GenerateAndSendOptions
): Promise<Result> {
  const {
    prompt,
    channel,
    caption = "Generated with Grok Imagine",
    useClaudeCodeCLI = true,
  } = options;

  console.log(`[INFO] Generating image via Chat Completions...`);
  console.log(`[INFO] Prompt: ${prompt}`);

  const { imageUrl } = await generateImage({ prompt });
  console.log(`[INFO] Image URL: ${imageUrl}`);

  console.log(`[INFO] Sending to channel: ${channel}`);

  await sendViaOpenClaw(
    {
      action: "send",
      channel,
      message: caption,
      media: imageUrl,
    },
    useClaudeCodeCLI
  );

  console.log(`[INFO] Done! Image sent to ${channel}`);

  return {
    success: true,
    imageUrl,
    channel,
    prompt,
  };
}

/**
 * Edit reference selfie and send to channel (primary skill flow).
 */
export async function editAndSend(
  options: EditAndSendOptions
): Promise<Result> {
  const {
    prompt,
    channel,
    caption = "Edited with Grok Imagine",
    referenceImageUrl = process.env.CLAWRA_REFERENCE_IMAGE_URL ||
      DEFAULT_REFERENCE_IMAGE,
    useClaudeCodeCLI = true,
  } = options;

  console.log(`[INFO] Editing reference image via Chat Completions...`);
  console.log(`[INFO] Prompt: ${prompt}`);

  const { imageUrl } = await editReferenceImage({
    prompt,
    imageUrl: referenceImageUrl,
  });
  console.log(`[INFO] Image URL: ${imageUrl}`);

  console.log(`[INFO] Sending to channel: ${channel}`);

  await sendViaOpenClaw(
    {
      action: "send",
      channel,
      message: caption,
      media: imageUrl,
    },
    useClaudeCodeCLI
  );

  console.log(`[INFO] Done! Image sent to ${channel}`);

  return {
    success: true,
    imageUrl,
    channel,
    prompt,
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: npx ts-node clawra-selfie.ts <prompt> <channel> [caption]

Arguments:
  prompt   - Image description or edit instruction (required)
  channel  - Target channel (required), e.g. #general, @user
  caption  - Message caption (default: 'Generated with Grok Imagine')

Modes:
  CLAWRA_SELFIE_MODE=generate  — text-to-image (default)
  CLAWRA_SELFIE_MODE=edit      — edit CLAWRA_REFERENCE_IMAGE_URL / default reference

Environment:
  CLAWRA_API_KEY           — Bearer token (required)
  CLAWRA_API_BASE_URL      — default https://api.2slk.com/v1
  CLAWRA_MODEL_GENERATE    — default grok-imagine-1.0
  CLAWRA_MODEL_EDIT        — default grok-imagine-1.0-edit
  CLAWRA_TEMPERATURE       — default 0.7
  CLAWRA_REFERENCE_IMAGE_URL — optional (edit mode)

Example:
  CLAWRA_API_KEY=sk-... npx ts-node clawra-selfie.ts "A cyberpunk city" "#art" "Check this out!"
`);
    process.exit(1);
  }

  const [prompt, channel, caption] = args;
  const mode = (process.env.CLAWRA_SELFIE_MODE || "generate").toLowerCase();

  try {
    const result =
      mode === "edit"
        ? await editAndSend({ prompt, channel, caption })
        : await generateAndSend({ prompt, channel, caption });

    console.log("\n--- Result ---");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[ERROR] ${(error as Error).message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
