import type { Request, Response } from "express";

type ResponseMeta = {
  request_id: string;
  timestamp: string;
  authenticated?: boolean;
};

type SuccessPayload = {
  success: true;
  code: string;
  message: string;
  data?: unknown;
  meta: ResponseMeta;
};

type ErrorPayload = {
  success: false;
  code: string;
  message: string;
  details?: unknown;
  meta: ResponseMeta;
};

const buildMeta = (req: Request, authenticated?: boolean): ResponseMeta => {
  const meta: ResponseMeta = {
    request_id: req.requestId || "unknown",
    timestamp: new Date().toISOString()
  };
  if (authenticated !== undefined) {
    meta.authenticated = authenticated;
  }
  return meta;
};

export const respondSuccess = (
  res: Response,
  req: Request,
  {
    status = 200,
    code,
    message,
    data,
    authenticated
  }: {
    status?: number;
    code: string;
    message: string;
    data?: unknown;
    authenticated?: boolean;
  }
) => {
  const payload: SuccessPayload = {
    success: true,
    code,
    message,
    data,
    meta: buildMeta(req, authenticated)
  };
  return res.status(status).json(payload);
};

export const respondError = (
  res: Response,
  req: Request,
  {
    status,
    code,
    message,
    details,
    authenticated
  }: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    authenticated?: boolean;
  }
) => {
  const payload: ErrorPayload = {
    success: false,
    code,
    message,
    details,
    meta: buildMeta(req, authenticated)
  };
  return res.status(status).json(payload);
};
