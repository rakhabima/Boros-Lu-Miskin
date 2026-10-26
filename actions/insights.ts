"use server";

import { requireUser } from "@/lib/session";
import { checkRateLimit, AI_LIMIT } from "@/lib/rateLimit";
import { config } from "@/lib/config";
import { resolveSummary, callOpenRouter } from "@/lib/insights";
import type { ChatMessage } from "@/types";

export async function askInsights(
  prompt: string,
  messages: ChatMessage[]
): Promise<{ text: string } | { error: string }> {
  const user = await requireUser();

  if (!config.ai.apiKey) {
    return { error: "AI belum disetel di server." };
  }

  const rate = await checkRateLimit(
    `ai:u:${user.id}`,
    AI_LIMIT.limit,
    AI_LIMIT.windowSec
  );
  if (!rate.allowed) {
    return { error: "Batas tanya AI jam ini udah penuh. Coba lagi nanti." };
  }

  const userPrompt = prompt?.trim() || "Kasih gua insight dan tips.";

  const safeMessages = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m.role === "string")
    .slice(-10)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "")
    }));

  const summary = await resolveSummary(user.id);
  try {
    return await callOpenRouter(summary, userPrompt, safeMessages);
  } catch (err) {
    // AbortSignal.timeout rejects with TimeoutError (approved fix 2).
    if (err instanceof Error && err.name === "TimeoutError") {
      return { error: "AI kelamaan jawab. Coba lagi ya." };
    }
    console.error("[AI] request failed", err);
    return { error: "Permintaan ke AI gagal. Coba lagi ya." };
  }
}
