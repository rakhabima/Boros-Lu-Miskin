import type { NextFunction, Request, Response } from "express";
import { respondError } from "../utils/response.js";
import { pool } from "../db.js";

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const session = req.session;
  const sessionId = req.sessionID;

  if (!session) {
    console.log("[AUTH DEBUG] requireAuth no session", {
      request_id: req.requestId,
      sessionID: sessionId
    });
    return respondError(res, req, {
      status: 401,
      code: "AUTH_SESSION_MISSING",
      message: "No session object found on request",
      details: { session_id: sessionId },
      authenticated: false
    });
  }

  const sessionKeys = Object.keys(session).filter((key) => key !== "cookie");
  if (sessionKeys.length === 0) {
    console.log("[AUTH DEBUG] requireAuth empty session", {
      request_id: req.requestId,
      sessionID: sessionId
    });
    return respondError(res, req, {
      status: 401,
      code: "AUTH_SESSION_EMPTY",
      message: "Session exists but contains no auth data",
      details: { session_id: sessionId },
      authenticated: false
    });
  }

  const userId = session.userId;
  if (!userId) {
    console.log("[AUTH DEBUG] requireAuth missing session userId", {
      request_id: req.requestId,
      sessionID: sessionId,
      sessionKeys
    });
    return respondError(res, req, {
      status: 401,
      code: "AUTH_SESSION_NO_USER",
      message: "Session exists but missing user identifier",
      details: { session_id: sessionId, session_keys: sessionKeys },
      authenticated: false
    });
  }

  if (!req.user) {
    try {
      const result = await pool.query(
        `SELECT id, google_id, email, name, avatar_url FROM users WHERE id = $1`,
        [userId]
      );
      if (result.rows.length === 0) {
        console.log("[AUTH DEBUG] requireAuth userId not found", {
          request_id: req.requestId,
          sessionID: sessionId,
          userId
        });
        return respondError(res, req, {
          status: 401,
          code: "AUTH_SESSION_USER_NOT_FOUND",
          message: "Session contains userId but user no longer exists",
          details: { session_id: sessionId, user_id: userId },
          authenticated: false
        });
      }
      req.user = result.rows[0];
    } catch (err) {
      return next(err);
    }
  }

  console.log("[AUTH DEBUG] requireAuth authorized", {
    request_id: req.requestId,
    sessionID: sessionId,
    userId: req.user?.id
  });
  return next();
};
