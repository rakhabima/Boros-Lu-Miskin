// Server component: plain forms posting to /api/sheets/*, no client JS.

export type SheetsConnection = {
  google_email: string | null;
  spreadsheet_url: string;
  status: "active" | "needs_reconnect" | "error";
  last_synced_at: string | null;
  last_error: string | null;
};

const FLASH: Record<string, { text: string; bad?: boolean }> = {
  connected: { text: "Google Sheets nyambung. Struk berikutnya bakal disalin ke spreadsheet Lo." },
  disconnected: { text: "Google Sheets diputusin. Spreadsheet Lo tetap ada di Google Drive." },
  denied: { text: "Izin Google dibatalin. Nggak ada yang berubah.", bad: true },
  scope_denied: { text: "Akses Google Drive-nya nggak dicentang. Coba lagi dan kasih aksesnya.", bad: true },
  no_refresh: { text: "Google nggak ngasih akses jangka panjang. Coba connect lagi.", bad: true },
  state_error: { text: "Sesinya nggak cocok atau udah kedaluwarsa. Coba connect lagi.", bad: true },
  not_configured: { text: "Google Sheets belum disetel di server.", bad: true },
  connect_first: { text: "Connect Google Sheets dulu sebelum nyalain salinan.", bad: true },
  error: { text: "Gagal nyambungin Google Sheets. Coba lagi ya.", bad: true }
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
    ? { text: "Belum nyambung", cls: "bg-neutral-100 text-neutral-600" }
    : connection.status === "active"
      ? { text: "Aktif", cls: "bg-emerald-50 text-emerald-700" }
      : { text: connection.status === "needs_reconnect" ? "Perlu di-connect ulang" : "Gagal nyalin", cls: "bg-amber-50 text-amber-800" };
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
            Salin tiap struk ke spreadsheet di Google Drive Lo sendiri. Aplikasi ini cuma bisa
            buka file yang dia bikin sendiri.
          </p>
          <div>{connect("Connect Google Sheets")}</div>
          {legacyWebhook && <Toggle on={mirrorOn} label="Salin lewat webhook lama (bareng-bareng)" />}
        </>
      ) : (
        <>
          {connection.status !== "active" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="mb-2">
                {connection.status === "needs_reconnect"
                  ? "Penyalinan berhenti: koneksi Google perlu di-connect ulang."
                  : "Penyalinan terakhir gagal. Bakal dicoba lagi di struk berikutnya."}
                {connection.last_error && <> {connection.last_error}</>}
              </p>
              {connect("Connect ulang")}
            </div>
          )}
          <dl className="grid grid-cols-1 gap-y-0.5 rounded-xl bg-neutral-50 p-3 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4 sm:gap-y-2">
            <dt className="text-neutral-500">Akun Google</dt>
            <dd className="mb-2 break-all sm:mb-0">{connection.google_email ?? "-"}</dd>
            <dt className="text-neutral-500">Spreadsheet</dt>
            <dd className="mb-2 sm:mb-0">
              <a href={connection.spreadsheet_url} target="_blank" rel="noreferrer" className="underline">
                Buka di Google Sheets
              </a>
            </dd>
            <dt className="text-neutral-500">Data terakhir masuk Sheets</dt>
            <dd>{fmt(connection.last_synced_at)}</dd>
          </dl>
          {connection.status === "active" && <Toggle on={mirrorOn} label="Salin struk ke Google Sheets" />}
          <form method="post" action="/api/sheets/disconnect">
            <button className={`${button} text-red-600`}>Cabut akses Drive Lo</button>
          </form>
        </>
      )}
    </section>
  );
}
