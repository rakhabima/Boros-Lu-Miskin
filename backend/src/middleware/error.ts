import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { respondError } from "../utils/response.js";

type HttpError = Error & {
  status?: number;
  code?: string;
  details?: unknown;
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("[ERROR]", {
    request_id: req.requestId,
    message: err.message
  });
  const httpError = err as HttpError;
  const status =
    typeof httpError.status === "number" ? httpError.status : 500;
  const payload: { error: string; code?: string; details?: unknown } = {
    error: status >= 500 ? "Internal server error" : httpError.message
  };

  if (httpError.code) {
    payload.code = httpError.code;
  }

  if (!config.session.isProd) {
    if (httpError.details !== undefined) {
      payload.details = httpError.details;
    }
    if (status >= 500) {
      payload.details = payload.details ?? httpError.message;
    }
  }

  if (res.headersSent) {
    return next(err);
  }

  return respondError(res, req, {
    status,
    code: httpError.code || "INTERNAL_ERROR",
    message: payload.error,
    details: payload.details,
    authenticated: Boolean(req.user)
  });
};
