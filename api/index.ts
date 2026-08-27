import type { IncomingMessage, ServerResponse } from "http";
import { app } from "../backend/src/app.js";

/**
 * Vercel entry point. It invokes an exported handler instead of calling
 * app.listen(), and the vercel.json rewrite forwards /api/* here with the
 * prefix intact — so strip it and hand the request to the Express app, whose
 * routes are mounted at /auth, /expenses, etc.
 *
 * An Express app is itself a (req, res) handler, so no wrapper app is needed.
 */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  req.url = req.url?.replace(/^\/api(?=\/|$)/, "") || "/";
  if (!req.url.startsWith("/")) req.url = `/${req.url}`;
  return (app as unknown as (rq: IncomingMessage, rs: ServerResponse) => void)(
    req,
    res
  );
}
