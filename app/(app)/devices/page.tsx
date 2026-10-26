import Link from "next/link";
import { pool } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listDevices, recentFailedAttempts } from "@/lib/devices";
import { revokeDeviceAction } from "@/actions/devices";
import { isLegacyWebhookUser } from "@/lib/sheets";
import { SheetsSection } from "@/components/SheetsSection";
import { SetupTipsButton } from "@/components/SetupTips";

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "-";

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

  const active = devices.filter((d) => !d.revoked_at);
  const revoked = devices.filter((d) => d.revoked_at);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <header>
        <h2 className="text-xl font-semibold">Devices</h2>
        <p className="text-sm text-neutral-600">
          Atur iPhone dan Sheets yang connect ke web ini.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="text-sm font-medium">Biar nyatet struk cuma ketok doang</p>
        <SetupTipsButton />
      </section>

      <Card
        title="iPhone yang connect"
        badge={<Badge tone={active.length > 0 ? "green" : "gray"}>{active.length} aktif</Badge>}
      >
        {devices.length === 0 ? (
          <Empty>Belum ada iPhone yang connect. Connect dulu lewat tombol di bawah.</Empty>
        ) : (
          <ul className="grid gap-3">
            {[...active, ...revoked].map((d) => (
              <li
                key={d.id}
                className={`rounded-xl border p-3 ${d.revoked_at ? "border-neutral-200 bg-neutral-50 opacity-70" : "border-neutral-200 bg-white"}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-lg"
                  >
                    📱
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{d.name}</p>
                      <Badge tone={d.revoked_at ? "gray" : "green"}>{d.revoked_at ? "Disconnect" : "Aktif"}</Badge>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-neutral-500">
                      {d.token_prefix ? `${d.token_prefix}…` : "-"}
                    </p>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-neutral-600">
                      <dt>Nyambung</dt>
                      <dd>{fmt(d.created_at)}</dd>
                      <dt>Terakhir dipakai</dt>
                      <dd>{fmt(d.last_used_at)}</dd>
                    </dl>
                  </div>
                  {!d.revoked_at && (
                    <form action={revokeDeviceAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button className="h-9 rounded-full border border-red-200 px-3 text-sm font-medium text-red-600 transition hover:bg-red-50">
                        Disconnect
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Connect iPhone" subtitle="Pasang Shortcut dan connect iPhone Lo!">
        <div>
          <Link href="/connect" className={buttonDark}>
            Connect iPhone
          </Link>
        </div>
      </Card>

      <SheetsSection
        connection={s?.status ? s : null}
        mirrorOn={s?.sheets_mirror ?? false}
        legacyWebhook={isLegacyWebhookUser(user.email)}
        flash={flash}
      />

      <Card
        title="Struk gagal terbaru"
        badge={failures.length > 0 ? <Badge tone="red">{failures.length}</Badge> : undefined}
      >
        {failures.length === 0 ? (
          <Empty>Nggak ada struk yang gagal. ✓</Empty>
        ) : (
          <ul className="grid gap-2">
            {failures.map((a) => (
              <li key={a.id} className="rounded-xl border border-neutral-200 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="red">{a.status}</Badge>
                  {a.error_code && (
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{a.error_code}</code>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-neutral-500">
                  {fmt(a.created_at)} · {a.device ?? "perangkat nggak dikenal"}
                  {a.duration_ms != null && ` · ${(a.duration_ms / 1000).toFixed(1)} s`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-neutral-500">
        <Link href="/privacy" className="underline">
          Kebijakan Privasi
        </Link>
      </p>
    </div>
  );
}

const buttonDark =
  "inline-flex h-10 items-center justify-center rounded-full bg-neutral-900 px-4 text-sm font-medium text-white transition hover:bg-neutral-700";

const TONES = {
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-neutral-100 text-neutral-600"
};

function Badge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

function Card({
  title,
  subtitle,
  badge,
  children
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">{title}</h3>
          {badge}
        </div>
        {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-center text-sm text-neutral-500">
      {children}
    </p>
  );
}
