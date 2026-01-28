import type { NextFunction, Request, Response } from "express";

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    console.log("[SESSION DEBUG] requireAuth unauthorized", {
      sessionID: req.sessionID,
      session: req.session,
      user: req.user
    });
    return res.status(401).json({ error: "Unauthorized" });
  }
  console.log("[SESSION DEBUG] requireAuth authorized", {
    sessionID: req.sessionID,
    session: req.session,
    user: req.user
  });
  next();
};
