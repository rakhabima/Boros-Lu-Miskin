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
      const { url } = await startTelegramLink(csrf);
      window.open(url, "_blank", "noopener,noreferrer");
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
    return <div>✅ Telegram Connected</div>;
  }

  return (
    <div>
      <button onClick={handleConnect} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect Telegram"}
      </button>
      {error && (
        <div style={{ color: "red", marginTop: "0.5rem" }}>{error}</div>
      )}
    </div>
  );
}
