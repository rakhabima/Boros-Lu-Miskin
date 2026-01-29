import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { pool } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { respondError, respondSuccess } from "../utils/response.js";

export const integrationsRouter = Router();

const TELEGRAM_API = config.telegram.botToken
  ? `https://api.telegram.org/bot${config.telegram.botToken}`
  : null;

const generateCode = () => randomBytes(4).toString("hex").toUpperCase();

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
 * Telegram webhook receiver
 * - Validates secret header
 * - Handles /start and /link
 */
integrationsRouter.post(
  "/telegram/webhook",
  asyncHandler(async (req: Request, res: Response) => {
    const secret = req.header("X-Telegram-Bot-Api-Secret-Token");
    if (!config.telegram.webhookSecret || !config.telegram.botToken) {
      console.error("[TELEGRAM] webhook missing env");
      return res.sendStatus(500);
    }
    if (secret !== config.telegram.webhookSecret) {
      console.warn("[TELEGRAM] invalid secret", { secret });
      return res.sendStatus(401);
    }

    const message = (req.body && req.body.message) || null;
    if (!message) return res.sendStatus(200);

    const chatId = message.chat?.id;
    const telegramId = message.from?.id;
    const text: string = message.text || "";

    if (!chatId || !telegramId) return res.sendStatus(200);

    if (text.startsWith("/start")) {
      await sendTelegramMessage(
        chatId,
        "Hi! Use /link to connect this chat to your expense account."
      );
      return res.sendStatus(200);
    }

    if (text.startsWith("/link")) {
      const code = generateCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await pool.query(
        `INSERT INTO telegram_links (telegram_id, code, confirmed, expires_at)
         VALUES ($1, $2, FALSE, $3)
         ON CONFLICT (telegram_id)
         DO UPDATE SET code = EXCLUDED.code, confirmed = FALSE, expires_at = EXCLUDED.expires_at`,
        [telegramId, code, expiresAt.toISOString()]
      );
      await sendTelegramMessage(
        chatId,
        `Link code: ${code}\nOpen the web app, go to Settings → Link Telegram, and paste this code within 10 minutes.`
      );
      return res.sendStatus(200);
    }

    // Default: if not linked, prompt; otherwise stub (full OCR/expense flow to be added later)
    const link = await pool.query(
      `SELECT confirmed, app_user_id FROM telegram_links WHERE telegram_id = $1 AND expires_at > NOW()`,
      [telegramId]
    );

    if (link.rows.length === 0 || !link.rows[0].confirmed) {
      await sendTelegramMessage(
        chatId,
        "This chat is not linked yet. Send /link to get a code, then paste it in the web app."
      );
      return res.sendStatus(200);
    }

    await sendTelegramMessage(
      chatId,
      "Linked chat received your message. Receipt parsing is not enabled yet in this stub."
    );
    return res.sendStatus(200);
  })
);

/**
 * Confirm link from the web app using the code generated in Telegram
 */
integrationsRouter.post(
  "/telegram/confirm",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.body || {};
    if (!code || typeof code !== "string") {
      return respondError(res, req, {
        status: 400,
        code: "TELEGRAM_CONFIRM_INVALID_CODE",
        message: "Code is required"
      });
    }

    const result = await pool.query(
      `UPDATE telegram_links
       SET app_user_id = $1, confirmed = TRUE
       WHERE code = $2 AND expires_at > NOW()
       RETURNING telegram_id`,
      [req.user!.id, code]
    );

    if (result.rows.length === 0) {
      return respondError(res, req, {
        status: 404,
        code: "TELEGRAM_CONFIRM_NOT_FOUND",
        message: "Code not found or expired"
      });
    }

    return respondSuccess(res, req, {
      code: "TELEGRAM_CONFIRM_SUCCESS",
      message: "Telegram chat linked successfully",
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
