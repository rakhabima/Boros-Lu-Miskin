import { pool } from "./db";
import { RECEIPT_SCOPE } from "./devices";

export type OnboardingStatus = {
  sheets: boolean;
  iphone: boolean;
  /** onboarding_completed_at is set (stays true if a step is undone later). */
  completed: boolean;
  /** This call is the one that set onboarding_completed_at. */
  justCompleted: boolean;
  sheetsStatus: string | null;
  googleEmail: string | null;
};

/**
 * The single place that decides onboarding state, used by /connect and
 * GET /api/onboarding/status. Both steps are read from the database; when both
 * hold it sets onboarding_completed_at (once: the UPDATE is conditional).
 * Later undoing a step never clears it, so nobody is re-locked.
 */
export async function syncOnboarding(userId: number): Promise<OnboardingStatus> {
  const { rows } = await pool.query(
    `SELECT u.onboarding_completed_at IS NOT NULL AS done,
            c.status AS sheets_status, c.google_email,
            EXISTS (SELECT 1 FROM devices d
                    WHERE d.user_id = u.id AND d.revoked_at IS NULL AND d.scope = $2) AS iphone
     FROM users u LEFT JOIN sheets_connections c ON c.user_id = u.id
     WHERE u.id = $1`,
    [userId, RECEIPT_SCOPE]
  );
  const r = rows[0];
  const sheets = r?.sheets_status === "active";
  const iphone = !!r?.iphone;

  let justCompleted = false;
  if (r && !r.done && sheets && iphone) {
    const res = await pool.query(
      `UPDATE users SET onboarding_completed_at = NOW()
       WHERE id = $1 AND onboarding_completed_at IS NULL`,
      [userId]
    );
    justCompleted = res.rowCount === 1;
  }
  return {
    sheets,
    iphone,
    completed: !!r?.done || justCompleted || (sheets && iphone),
    justCompleted,
    sheetsStatus: r?.sheets_status ?? null,
    googleEmail: r?.google_email ?? null
  };
}
