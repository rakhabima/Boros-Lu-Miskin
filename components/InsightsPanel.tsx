"use client";

import { useEffect, useState } from "react";
import { askInsights } from "@/actions/insights";
import type { ChatMessage } from "@/types";

const defaultInsightPrompt = "give me insights about my expenses";
const storageKey = "insights-chat";

export function InsightsPanel() {
  const [prompt, setPrompt] = useState(defaultInsightPrompt);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSentIndex, setLastSentIndex] = useState<number | null>(null);

  // Restore after mount, not in a useState initializer: this component is
  // server-rendered, so reading storage during render would hydrate-mismatch.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      // Corrupt or unavailable storage: start with an empty transcript.
    }
  }, []);

  // Never clears the key: this runs on mount too, while the restore above has
  // only queued its state update, so deleting here would wipe the transcript
  // before it lands.
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)));
    } catch {
      // Private mode / quota: persistence is best-effort.
    }
  }, [messages]);

  async function handleInsights() {
    if (loading) return;
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;
    setError("");
    setLoading(true);
    setPrompt("");
    try {
      const nextMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: trimmedPrompt }
      ];
      setMessages(nextMessages);
      setLastSentIndex(nextMessages.length - 1);
      const result = await askInsights(trimmedPrompt, nextMessages);
      if ("error" in result) {
        setError(result.error);
        // Roll back the optimistic message and hand the text back, so a failed
        // send does not leave an unanswered question in the transcript (which
        // would then be replayed as history) or lose what the user typed.
        setMessages(messages);
        setLastSentIndex(null);
        setPrompt(trimmedPrompt);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.text }
        ]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get insights";
      setError(message);
      setMessages(messages);
      setLastSentIndex(null);
      setPrompt(trimmedPrompt);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6 flex flex-col gap-4">
      <div className="text-sm text-neutral-500">
        Ask for spending insights and tips.
      </div>

      <div
        className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm space-y-3 max-h-[420px] overflow-y-auto"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div>Your AI insights will appear here.</div>
        )}
        {messages.map((msg, index) => (
          <div
            key={`${msg.role}-${index}`}
            className={`max-w-[80%] rounded-md px-3 py-2 ${
              msg.role === "user"
                ? "ml-auto bg-white border border-neutral-200"
                : "bg-neutral-900 text-white"
            } ${
              msg.role === "user" && index === lastSentIndex
                ? "chat-fade-in"
                : ""
            }`}
          >
            <div className="text-xs uppercase tracking-wide opacity-70 mb-1">
              {msg.role}
            </div>
            <div className="whitespace-pre-line">{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="max-w-[60%] rounded-md px-3 py-2 bg-neutral-900 text-white chat-fade-in">
            <div className="text-xs uppercase tracking-wide opacity-70 mb-1">
              assistant
            </div>
            <div className="flex items-center gap-1">
              <span className="typing-dot">•</span>
              <span className="typing-dot">•</span>
              <span className="typing-dot">•</span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleInsights();
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="h-10 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm disabled:opacity-60"
            placeholder="Type a message..."
            disabled={loading}
          />
          <button
            type="submit"
            className="h-10 rounded-md bg-neutral-900 px-4 text-sm text-white inline-flex items-center gap-2 transition"
            disabled={loading || !prompt.trim()}
            aria-busy={loading}
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4z" />
            </svg>
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </form>
    </div>
  );
}
