import Link from "next/link";
import { pool } from "@/lib/db";
import { config } from "@/lib/config";
import { requireUser } from "@/lib/session";
import { listDevices, recentFailedAttempts } from "@/lib/devices";
import { revokeDeviceAction } from "@/actions/devices";
import { SHORTCUT_NAME } from "@/lib/branding";
import { isLegacyWebhookUser } from "@/lib/sheets";
import { SheetsSection } from "@/components/SheetsSection";

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "—";

export default async function DevicesPage({
  searchParams
}: {
  searchParams: Promise<{ sheets?: string }>;
}) {
  const user = await requireUser();
  const [devices, failures, settings, { sheets: flash }] = await Promise.all([
    listDevices(user.id),
    recentFailedAttempts(user.id),
    pool.query(
      `SELECT u.sheets_mirror, c.google_email, c.spreadsheet_url, c.status, c.last_synced_at, c.last_error
       FROM users u LEFT JOIN sheets_connections c ON c.user_id = u.id WHERE u.id = $1`,
      [user.id]
    ),
    searchParams
  ]);
  const s = settings.rows[0];

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="text-lg font-semibold mb-1">Connect an iPhone</h2>
        <p className="text-sm text-neutral-600">
          1.{" "}
          {config.shortcutInstallUrl ? (
            <a href={config.shortcutInstallUrl} className="underline">
              Install the “{SHORTCUT_NAME}” Shortcut
            </a>
          ) : (
            <>Install the “{SHORTCUT_NAME}” Shortcut (install link not configured yet; see docs/shortcut-setup.md)</>
          )}
          . 2. On the iPhone, open <span className="font-mono">/connect</span> in Safari, or just
          run the Shortcut once, and tap Connect.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Connected devices</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-neutral-500">No devices yet.</p>
        ) : (
          <table className="w-full text-sm rounded-lg border border-neutral-200 bg-white">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Token</th>
                <th className="text-left px-3 py-2">Connected</th>
                <th className="text-left px-3 py-2">Last used</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{d.name}</td>
                  <td className="px-3 py-2 font-mono">{d.token_prefix ? `${d.token_prefix}…` : "—"}</td>
                  <td className="px-3 py-2">{fmt(d.created_at)}</td>
                  <td className="px-3 py-2">{fmt(d.last_used_at)}</td>
                  <td className="px-3 py-2 text-right">
                    {d.revoked_at ? (
                      <span className="text-neutral-500">Revoked</span>
                    ) : (
                      <form action={revokeDeviceAction}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="text-red-600">Revoke</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <SheetsSection
        connection={s?.status ? s : null}
        mirrorOn={s?.sheets_mirror ?? false}
        legacyWebhook={isLegacyWebhookUser(user.email)}
        flash={flash}
      />

      <section>
        <h2 className="text-lg font-semibold mb-3">Recent failed receipts</h2>
        {failures.length === 0 ? (
          <p className="text-sm text-neutral-500">None.</p>
        ) : (
          <table className="w-full text-sm rounded-lg border border-neutral-200 bg-white">
            <thead className="bg-neutral-50 text-neutral-600">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">Device</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Error</th>
                <th className="text-right px-3 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {failures.map((a) => (
                <tr key={a.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2">{fmt(a.created_at)}</td>
                  <td className="px-3 py-2">{a.device ?? "—"}</td>
                  <td className="px-3 py-2">{a.status}</td>
                  <td className="px-3 py-2 font-mono">{a.error_code ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {a.duration_ms != null ? `${(a.duration_ms / 1000).toFixed(1)} s` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <p className="text-xs text-neutral-500">
        <Link href="/privacy" className="underline">
          Kebijakan Privasi
        </Link>
      </p>
    </div>
  );
}
