import { config } from "./config";
import { VISION_PROMPT } from "./receipt";

const BUDGET_MS = 45_000;
// First attempt gets most of the budget; a retry only happens with what is left.
const FIRST_ATTEMPT_MS = 30_000;
const MIN_RETRY_MS = 5_000;

/** error code lands in receipt_attempts.error_code. */
export class VisionError extends Error {
  constructor(public code: string, message = code) {
    super(message);
  }
}

/**
 * Sends the image to 9router and returns the raw reply text. Retries once on
 * timeout or 5xx only; 4xx are config errors and fail immediately.
 * Never logs the image.
 */
export async function readReceipt(image: Buffer, mime: string): Promise<string> {
  const { url, key, model } = config.vision;
  if (!url || !key) throw new VisionError("not_configured");

  const body = JSON.stringify({
    model,
    stream: false,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: VISION_PROMPT },
          { type: "image_url", image_url: { url: `data:${mime};base64,${image.toString("base64")}` } }
        ]
      }
    ]
  });

  const deadline = Date.now() + BUDGET_MS;
  let lastCode = "timeout";
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (attempt > 0 && remaining < MIN_RETRY_MS) break;
    const timeout = attempt === 0 ? Math.min(FIRST_ATTEMPT_MS, remaining) : remaining;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
        signal: AbortSignal.timeout(timeout)
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        lastCode = "timeout";
        continue;
      }
      throw new VisionError("network_error");
    }

    if (res.status >= 500) {
      lastCode = `provider_${res.status}`;
      continue;
    }
    if (!res.ok) throw new VisionError(`provider_${res.status}`);

    const data = await res.json().catch(() => null);
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new VisionError("empty_reply");
    return text;
  }
  throw new VisionError(lastCode);
}
