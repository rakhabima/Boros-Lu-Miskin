"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_MS = 3000;
const MAX_POLL_MS = 10 * 60_000;

/** Laptop only: waits for the iPhone step, then moves on by itself. */
export function IphonePoller() {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(async () => {
      if (Date.now() - started > MAX_POLL_MS) return clearInterval(id);
      if (document.hidden) return;
      try {
        const res = await fetch("/api/onboarding/status", { cache: "no-store" });
        if (!res.ok) return;
        const s = await res.json();
        if (!s.iphone) return;
        clearInterval(id);
        if (s.completed) router.replace("/");
        else router.refresh();
      } catch {}
    }, POLL_MS);
    return () => clearInterval(id);
  }, [router]);
  return <p className="text-sm text-neutral-500">Menunggu iPhone...</p>;
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-9 min-w-0 flex-1 rounded-md border border-neutral-300 px-2 font-mono text-xs"
      />
      <button
        type="button"
        className="h-9 rounded-md border border-neutral-300 px-3 text-sm"
        onClick={() =>
          navigator.clipboard
            ?.writeText(url)
            .then(() => setCopied(true))
            .catch(() => {})
        }
      >
        {copied ? "Tersalin" : "Salin"}
      </button>
    </div>
  );
}
