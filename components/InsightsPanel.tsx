"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { askInsights } from "@/actions/insights";
import type { ChatMessage } from "@/types";

const defaultInsightPrompt = "give me insights about my expenses";
const storageKey = "insights-chat";

type ChatState = {
  messages: ChatMessage[];
  loading: boolean;
  error: string;
  lastSentIndex: number | null;
};

// Module scope, not component state: an in-flight request has to outlive this
// panel unmounting when the user switches pages. The server action's fetch was
// never cancelled by navigation, but its `await` used to resolve into a dead
// component, so the reply was discarded.
const emptyState: ChatState = {
  messages: [],
  loading: false,
  error: "",
  lastSentIndex: null
};
let state = emptyState;
const listeners = new Set<() => void>();

function setState(patch: Partial<ChatState>) {
  state = { ...state, ...patch };
  // Persist here rather than from a component effect, so a reply that lands
  // while the panel is unmounted still survives a reload.
  if (patch.messages) {
    try {
      // Clearing matters: rolling a failed FIRST message back to an empty
      // transcript must wipe the stored optimistic copy, or a reload restores
      // an unanswered question and replays it as history.
      if (state.messages.length === 0) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify(state.messages.slice(-50)));
    } catch {
      // Private mode / quota: persistence is best-effort.
    }
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => state;
// SSR renders client components too, and module scope is shared across requests
// there. Always emitting the empty state keeps one user's chat out of another's
// HTML, and matches the pre-restore client render so hydration lines up.
const getServerSnapshot = () => emptyState;

async function sendMessage(text: string): Promise<{ ok: boolean }> {
  if (state.loading) return { ok: false };
  const previous = state.messages;
  const next: ChatMessage[] = [...previous, { role: "user", content: text }];
  setState({
    messages: next,
    lastSentIndex: next.length - 1,
    loading: true,
    error: ""
  });
  try {
    const result = await askInsights(text, next);
    if ("error" in result) {
      // Roll the optimistic message back so a failed send leaves no unanswered
      // question in the transcript to be replayed as history.
      setState({ error: result.error, messages: previous, lastSentIndex: null });
      return { ok: false };
    }
    setState({
      messages: [...next, { role: "assistant", content: result.text }]
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get insights";
    setState({ error: message, messages: previous, lastSentIndex: null });
    return { ok: false };
  } finally {
    setState({ loading: false });
  }
}

export function InsightsPanel() {
  const { messages, loading, error, lastSentIndex } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const [prompt, setPrompt] = useState(defaultInsightPrompt);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Pin to the newest message, including the typing indicator while it shows.
  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  // Restore after mount, not in a useState initializer: this component is
  // server-rendered, so reading storage during render would hydrate-mismatch.
  // Only seeds an empty store, so navigating back never clobbers a live chat.
  useEffect(() => {
    if (state.messages.length > 0) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setState({ messages: JSON.parse(saved) });
    } catch {
      // Corrupt or unavailable storage: start with an empty transcript.
    }
  }, []);

  async function handleInsights() {
    if (loading) return;
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;
    setPrompt("");
    const { ok } = await sendMessage(trimmedPrompt);
    // Still mounted and it failed: hand the text back so nothing is lost.
    if (!ok) setPrompt(trimmedPrompt);
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6 flex flex-col gap-4">
      <div className="text-sm text-neutral-500">
        Ask for spending insights and tips.
      </div>

      <div
        ref={transcriptRef}
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
