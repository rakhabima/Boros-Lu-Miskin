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
      csrfToken?: () => string;
    }
  }
}

export {};

declare module "express-session" {
  interface SessionData {
    userId?: number;
    // Set when a CSRF token is issued, purely so the session is persisted and
    // its id stays stable — the token is bound to that id.
    csrfBootstrap?: boolean;
  }
}
