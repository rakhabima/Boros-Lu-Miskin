import type { NextFunction, Request, Response } from "express";
import { respondError } from "../utils/response.js";

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const session = req.session;
  const sessionId = req.sessionID;
  const hasPassportUser =
    typeof (session as { passport?: { user?: unknown } })?.passport?.user !==
    "undefined";

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

  if (!req.user && !hasPassportUser) {
    console.log("[AUTH DEBUG] requireAuth missing passport user", {
      request_id: req.requestId,
      sessionID: sessionId,
      sessionKeys
    });
    return respondError(res, req, {
      status: 401,
      code: "AUTH_SESSION_NO_USER",
      message: "Session exists but no authenticated user found",
      details: { session_id: sessionId, session_keys: sessionKeys },
      authenticated: false
    });
  }

  if (!req.user && hasPassportUser) {
    console.log("[AUTH DEBUG] requireAuth passport user not deserialized", {
      request_id: req.requestId,
      sessionID: sessionId
    });
    return respondError(res, req, {
      status: 401,
      code: "AUTH_DESERIALIZE_FAILED",
      message: "Session contains auth data but user is not deserialized",
      details: { session_id: sessionId },
      authenticated: false
    });
  }

  console.log("[AUTH DEBUG] requireAuth authorized", {
    request_id: req.requestId,
    sessionID: sessionId,
    userId: req.user?.id
  });
  return next();
};
