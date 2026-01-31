import { useEffect, useState } from "react";
import { fetchCsrfToken, getTelegramStatus, startTelegramLink } from "../api";

type StatusState = "loading" | "connected" | "disconnected";

export function TelegramConnect() {
  const [status, setStatus] = useState<StatusState>("loading");
  const [error, setError] = useState<string>("");
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getTelegramStatus();
        if (!cancelled) {
          setStatus(res.connected ? "connected" : "disconnected");
        }
      } catch (err) {
        if (!cancelled) setError("Failed to load Telegram status.");
      } finally {
        if (!cancelled && status === "loading") {
          // if error already set, keep status as loading? better set disconnected for retry
          if (!error) setStatus("disconnected");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = async () => {
    setError("");
    setConnecting(true);
    try {
      const csrf = await fetchCsrfToken();
      const res = await fetch("/integrations/telegram/start-link", {
        method: "POST",
        headers: {
          "X-CSRF-Token": csrf
        },
        credentials: "include"
      });
      if (!res.ok) {
        throw new Error("Failed to start Telegram linking");
      }
      const payload = await res.json();
      console.log("Telegram start-link payload:", payload);
      const telegramUrl = payload?.data?.url;
      if (!telegramUrl) {
        throw new Error("Telegram link URL missing from response");
      }
      window.open(telegramUrl, "_blank");
    } catch (err) {
      setError("Could not start Telegram linking. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  if (status === "loading") {
    return <div>Loading Telegram status…</div>;
  }

  if (status === "connected") {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 border border-green-200">
        <span>✅</span>
        <span>Telegram Connected</span>
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col gap-2">
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="inline-flex items-center justify-center rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-4 py-2 text-sm font-medium transition-colors"
      >
        {connecting ? "Connecting…" : "Connect Telegram"}
      </button>
      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}
    </div>
  );
}
