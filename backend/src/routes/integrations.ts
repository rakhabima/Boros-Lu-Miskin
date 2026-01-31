import { Router, type Request, type Response } from "express";
import { pool } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { respondError, respondSuccess } from "../utils/response.js";
import { signLinkToken, verifyLinkToken } from "../utils/linkToken.js";

export const integrationsRouter = Router();

const TELEGRAM_API = config.telegram.botToken
  ? `https://api.telegram.org/bot${config.telegram.botToken}`
  : null;

const sendTelegramMessage = async (chatId: number, text: string) => {
  if (!TELEGRAM_API) return;
  try {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (err) {
    console.error("[TELEGRAM] sendMessage failed", { err });
  }
};

/**
 * Start link flow: generates deep link token for Telegram /start
 */
integrationsRouter.post(
  "/telegram/start-link",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!config.telegram.botUsername) {
      return respondError(res, req, {
        status: 500,
        code: "TELEGRAM_BOT_USERNAME_MISSING",
        message: "Bot username is not configured"
      });
    }
    const ttlMinutes = 5;
    const token = signLinkToken(req.user!.id, ttlMinutes);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    // one row per user; reset any pending/unconfirmed rows
    await pool.query(`DELETE FROM telegram_links WHERE app_user_id = $1`, [req.user!.id]);
    await pool.query(
      `INSERT INTO telegram_links (telegram_id, app_user_id, code, confirmed, expires_at, created_at)
       VALUES (NULL, $1, $2, FALSE, $3, NOW())`,
      [req.user!.id, token, expiresAt.toISOString()]
    );
    const uniqueSuffix = Date.now();
    const url = `https://t.me/${config.telegram.botUsername}?start=link_${token}__${uniqueSuffix}`;
    console.log("[TELEGRAM] start-link created", {
      user_id: req.user!.id,
      token,
      expires_at: expiresAt.toISOString(),
      url
    });
    return respondSuccess(res, req, {
      code: "TELEGRAM_START_LINK_SUCCESS",
      message: "Generated Telegram link URL",
      data: { url },
      authenticated: true
    });
  })
);

/**
 * Telegram webhook receiver
 * - Validates secret header
 * - Handles /start and /link
 */
integrationsRouter.post(
  "/telegram/webhook",
  asyncHandler(async (req: Request, res: Response) => {
    // Always acknowledge to Telegram; log and return 200 on any issue.
    const ack = () => res.sendStatus(200);

    try {
      const update = req.body || {};
      console.log("[TG RAW UPDATE]", JSON.stringify(update, null, 2));

      if (!config.telegram.webhookSecret || !config.telegram.botToken) {
        console.error("[TELEGRAM] missing bot env");
        return ack();
      }

      const secret = req.header("X-Telegram-Bot-Api-Secret-Token");
      if (secret !== config.telegram.webhookSecret) {
        console.warn("[TELEGRAM] invalid secret", { secret });
        return ack();
      }

      const message = update.message;
      console.log("[TG MESSAGE TEXT]", message?.text);
      console.log("[TG CHAT ID]", message?.chat?.id);
      console.log("[TG FROM ID]", message?.from?.id);

      if (message?.text === "/start") {
        console.warn("[TG START WITHOUT TOKEN]");
      }
      if (message?.text?.startsWith("/start link_")) {
        console.info("[TG START WITH TOKEN]");
      }

      if (!message || typeof message !== "object") {
        return ack();
      }

      const chatId = message.chat?.id;
      const telegramId = message.from?.id;
      const text: string = message.text || "";

      if (!chatId || !telegramId || !text) {
        return ack();
      }

      if (text.startsWith("/start")) {
        // Expecting /start link_<token>
        const parts = text.split(/\s+/);
        const tokenPart = parts.find((p) => p.includes("link_"));
        if (tokenPart && tokenPart.includes("link_")) {
          const raw = tokenPart.split("link_")[1];
          const [token] = raw.split("__"); // strip suffix
          const payload = verifyLinkToken(token);
          if (!payload) {
            await sendTelegramMessage(chatId, "⚠️ Link tidak valid atau sudah kedaluwarsa.");
            console.warn("[TELEGRAM] invalid token", { chatId, telegramId, raw });
            return ack();
          }
          // confirm only existing pending link rows
          const pending = await pool.query(
            `SELECT app_user_id, confirmed, expires_at
             FROM telegram_links
             WHERE code = $1 AND app_user_id = $2`,
            [token, payload.uid]
          );

          if (
            pending.rows.length === 0 ||
            pending.rows[0].confirmed ||
            (pending.rows[0].expires_at && new Date(pending.rows[0].expires_at) < new Date())
          ) {
            await sendTelegramMessage(chatId, "⚠️ Link tidak valid atau sudah kedaluwarsa.");
            console.warn("[TELEGRAM] pending not found/expired", {
              chatId,
              telegramId,
              token,
              expires_at: pending.rows[0]?.expires_at,
              confirmed: pending.rows[0]?.confirmed
            });
            return ack();
          }

          await pool.query(
            `UPDATE telegram_links
             SET telegram_id = $1, confirmed = TRUE, expires_at = NULL
             WHERE code = $2 AND app_user_id = $3`,
            [telegramId, token, payload.uid]
          );

          await sendTelegramMessage(
            chatId,
            "✅ Telegram account successfully connected.\nYou can now send receipt photos to record expenses."
          );
          console.log("[TELEGRAM] link confirmed", { chatId, telegramId, user_id: payload.uid });
          return ack();
        }

        console.warn("[TELEGRAM] /start without link token", { chatId, telegramId, text });
        await sendTelegramMessage(chatId, "❌ Telegram is not connected.\nPlease connect your account from the web app.");
        return ack();
      }

      // For any other message, ensure chat is linked
      const linked = await pool.query(
        `SELECT app_user_id FROM telegram_links WHERE telegram_id = $1 AND confirmed = TRUE LIMIT 1`,
        [telegramId]
      );
      if (linked.rows.length === 0) {
        await sendTelegramMessage(chatId, "❌ Telegram is not connected.\nPlease connect your account from the web app.");
        return ack();
      }

      // Non-/link messages: ignore for now (future OCR/logic).
      return ack();
    } catch (err) {
      console.error("[TELEGRAM] webhook handler error", err);
      return ack();
    }
  })
);

/**
 * Confirm link from the web app using the code generated in Telegram
 */
integrationsRouter.post(
  "/telegram/confirm",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    return respondError(res, req, {
      status: 410,
      code: "TELEGRAM_CONFIRM_DEPRECATED",
      message: "Code-based linking is no longer supported. Use the Connect Telegram button in the web app.",
      authenticated: true
    });
  })
);

/**
 * Telegram link status for the logged-in user
 */
integrationsRouter.get(
  "/telegram/status",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await pool.query(
      `SELECT telegram_id
       FROM telegram_links
       WHERE app_user_id = $1 AND confirmed = TRUE
       LIMIT 1`,
      [req.user!.id]
    );

    const connected = result.rows.length > 0;
    return respondSuccess(res, req, {
      code: "TELEGRAM_STATUS_SUCCESS",
      message: "Telegram status retrieved",
      data: { connected },
      authenticated: true
    });
  })
);

/**
 * Helper route to register the webhook with Telegram (protect in production)
 */
integrationsRouter.post(
  "/telegram/set-webhook",
  asyncHandler(async (_req: Request, res: Response) => {
    if (!config.telegram.botToken || !config.telegram.webhookSecret || !config.origins.backend) {
      return res.status(500).json({ message: "Missing Telegram config or backend origin" });
    }
    const url = `${config.origins.backend.replace(/\/$/, "")}/integrations/telegram/webhook`;
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${config.telegram.botToken}/setWebhook`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url,
            secret_token: config.telegram.webhookSecret,
            allowed_updates: ["message", "callback_query"]
          })
        }
      );
      const data = await resp.json();
      return res.json({ ok: true, telegram_response: data });
    } catch (err) {
      console.error("[TELEGRAM] setWebhook error", err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  })
);
