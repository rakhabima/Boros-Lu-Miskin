import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { gateApplies } from "@/lib/onboardingCore";
import { requireUser } from "@/lib/session";
import { signOut } from "@/actions/auth";
import { APP_LOGO, APP_NAME } from "@/lib/branding";
import { pool } from "@/lib/db";
import { NavLink } from "@/components/NavLink";

export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // Only the dashboard pages live in this group; /connect, /login and every
  // /api route sit outside it, so they can never be gated.
  if (gateApplies(config.onboarding.gateEnabled, user.onboarding_completed_at)) redirect("/connect");

  const sheet = await pool.query(
    `SELECT spreadsheet_url FROM sheets_connections WHERE user_id = $1`,
    [user.id]
  );
  const sheetUrl: string | undefined = sheet.rows[0]?.spreadsheet_url;
  const navBtn =
    "h-10 inline-flex items-center rounded-md border px-3 text-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 sm:px-4";

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <span role="img" aria-label="Money with wings">
                {APP_LOGO}
              </span>
              {APP_NAME}
            </h1>
            <p className="text-sm text-neutral-600">Masuk sebagai {user.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <NavLink href="/">Pengeluaran</NavLink>
            <NavLink href="/insights">Tanya AI</NavLink>
            <NavLink href="/devices">Devices</NavLink>
            {sheetUrl && (
              <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className={`${navBtn} border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>
                Cek Sheets
              </a>
            )}
            <form action={signOut}>
              <button type="submit" className={`${navBtn} border-red-200 text-red-600 hover:bg-red-50`}>
                Log out
              </button>
            </form>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
