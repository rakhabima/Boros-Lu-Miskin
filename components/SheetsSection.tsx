// Server component: plain forms posting to /api/sheets/*, no client JS.

export type SheetsConnection = {
  google_email: string | null;
  spreadsheet_url: string;
  status: "active" | "needs_reconnect" | "error";
  last_synced_at: string | null;
  last_error: string | null;
};

const FLASH: Record<string, { text: string; bad?: boolean }> = {
  connected: { text: "Google Sheets terhubung. Struk berikutnya akan disalin ke spreadsheet-mu." },
  disconnected: { text: "Google Sheets diputus. Spreadsheet-mu tetap ada di Google Drive." },
  denied: { text: "Izin Google dibatalkan. Tidak ada yang berubah.", bad: true },
  scope_denied: { text: "Akses Google Drive tidak dicentang. Coba lagi dan izinkan aksesnya.", bad: true },
  no_refresh: { text: "Google tidak memberi akses jangka panjang. Coba hubungkan lagi.", bad: true },
  state_error: { text: "Sesi tidak cocok atau kedaluwarsa. Coba hubungkan lagi.", bad: true },
  not_configured: { text: "Google Sheets belum dikonfigurasi di server.", bad: true },
  connect_first: { text: "Hubungkan Google Sheets dulu sebelum menyalakan salinan.", bad: true },
  error: { text: "Gagal menghubungkan Google Sheets. Coba lagi.", bad: true }
};

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "belum pernah";

const button = "h-9 rounded-full border border-neutral-300 px-4 text-sm font-medium";

function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <form method="post" action="/api/sheets/toggle" className="flex flex-wrap items-center gap-3 text-sm">
      <input type="hidden" name="enabled" value={on ? "off" : "on"} />
      <span>
        {label}: <strong>{on ? "aktif" : "mati"}</strong>
      </span>
      <button className={button}>{on ? "Matikan" : "Nyalakan"}</button>
    </form>
  );
}

export function SheetsSection({
  connection,
  mirrorOn,
  legacyWebhook,
  flash
}: {
  connection: SheetsConnection | null;
  mirrorOn: boolean;
  legacyWebhook: boolean;
  flash?: string;
}) {
  const note = flash ? FLASH[flash] : undefined;
  const badge = !connection
    ? { text: "Belum terhubung", cls: "bg-neutral-100 text-neutral-600" }
    : connection.status === "active"
      ? { text: "Aktif", cls: "bg-emerald-50 text-emerald-700" }
      : { text: connection.status === "needs_reconnect" ? "Perlu dihubungkan ulang" : "Gagal menyalin", cls: "bg-amber-50 text-amber-800" };
  const connect = (label: string) => (
    <a href="/api/sheets/connect" className={`${button} inline-flex items-center bg-neutral-900 text-white`}>
      {label}
    </a>
  );

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">Google Sheets</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.text}</span>
      </div>
      {note && (
        <p role="status" className={`rounded-lg p-3 text-sm ${note.bad ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {note.text}
        </p>
      )}

      {!connection ? (
        <>
          <p className="text-sm text-neutral-600">
            Salin setiap struk ke spreadsheet di Google Drive-mu sendiri. Aplikasi hanya bisa
            mengakses file yang dibuatnya.
          </p>
          <div>{connect("Hubungkan Google Sheets")}</div>
          {legacyWebhook && <Toggle on={mirrorOn} label="Salin lewat webhook lama (bersama)" />}
        </>
      ) : (
        <>
          {connection.status !== "active" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-2">
                {connection.status === "needs_reconnect"
                  ? "Penyalinan berhenti: koneksi Google perlu dihubungkan ulang."
                  : "Penyalinan terakhir gagal; akan dicoba lagi di struk berikutnya."}
                {connection.last_error && <> {connection.last_error}</>}
              </p>
              {connect("Hubungkan ulang")}
            </div>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-neutral-50 p-3 text-sm">
            <dt className="text-neutral-500">Akun Google</dt>
            <dd className="break-all">{connection.google_email ?? "—"}</dd>
            <dt className="text-neutral-500">Spreadsheet</dt>
            <dd>
              <a href={connection.spreadsheet_url} target="_blank" rel="noreferrer" className="underline">
                Buka di Google Sheets
              </a>
            </dd>
            <dt className="text-neutral-500">Terakhir disalin</dt>
            <dd>{fmt(connection.last_synced_at)}</dd>
          </dl>
          {connection.status === "active" && <Toggle on={mirrorOn} label="Salin struk ke Google Sheets" />}
          <form method="post" action="/api/sheets/disconnect">
            <button className={`${button} text-red-600`}>Putuskan</button>
          </form>
        </>
      )}
    </section>
  );
}
