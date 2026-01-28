import "express";

declare global {
  namespace Express {
    interface User {
      id: number;
      google_id: string | null;
      email: string | null;
      name: string;
      avatar_url: string | null;
    }

    interface Request {
      requestId: string;
    }
  }
}

export {};

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}
