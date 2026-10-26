import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { signOut } from "@/actions/auth";
import { getSession } from "@/lib/session";
import { syncOnboarding } from "@/lib/onboarding";
import { connectUrl, isIphone } from "@/lib/onboardingCore";
import { qrSvg } from "@/lib/qr";
import { APP_LOGO, APP_NAME, SHORTCUT_NAME } from "@/lib/branding";
import { CopyLink, IphonePoller } from "@/components/ConnectClient";

const RETRY_DRIVE = "Akses Google Drive-nya perlu dikasih. Centang izin Drive di layar Google, terus coba lagi.";
const RETRY_GENERIC = "Gagal nyambungin Google Sheets. Coba lagi ya.";
const FLASH: Record<string, string> = {
  denied: RETRY_DRIVE,
  scope_denied: RETRY_DRIVE,
  no_refresh: RETRY_GENERIC,
  state_error: RETRY_GENERIC,
  not_configured: "Google Sheets belum disetel di server. Kabarin admin.",
  error: RETRY_GENERIC
};

const primary = "inline-flex h-11 w-full items-center justify-center rounded-md bg-neutral-900 px-4 text-sm font-medium text-white";
const card = "rounded-xl border border-neutral-200 bg-white p-5";

// Opened by a new user (the gate sends them here), and on the iPhone by the
// Shortcut when it has no token yet.
export default async function ConnectPage({
  searchParams
}: {
  searchParams: Promise<{ sheets?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login?next=/connect");

  const [{ sheets: flash }, h] = await Promise.all([searchParams, headers()]);
  const st = await syncOnboarding(user.id);
  if (st.justCompleted) redirect("/?tips=1");

  const iphone = isIphone(h.get("user-agent"));
  // Someone already onboarded may re-pair an iPhone without redoing step 1.
  const locked = !st.completed && !st.sheets;
  const allDone = st.sheets && st.iphone;
  const reconnect = st.sheetsStatus === "needs_reconnect" || st.sheetsStatus === "error";

  const proto = h.get("x-forwarded-proto") ?? (config.session.isProd ? "https" : "http");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const url = connectUrl(config.appBaseUrl, `${proto}://${host}`);
  const qr = !iphone && !locked && !st.iphone ? await qrSvg(url) : null;

  return (
    <div className="min-h-screen flex items-center py-8">
      <div className="max-w-md mx-auto px-4 w-full grid gap-4">
        <header className="grid gap-3">
          <h1 className="text-xl font-semibold">
            {APP_LOGO} {APP_NAME}
          </h1>

          <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm">
            {user.avatar_url ? (
              // Google profile photo: a plain <img>, it is not worth next/image config.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt=""
                referrerPolicy="no-referrer"
                className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-neutral-100"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-base font-semibold text-white"
              >
                {user.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-500">Masuk sebagai</p>
              <p className="truncate text-sm font-semibold text-neutral-900">{user.name}</p>
              {user.email && <p className="truncate text-xs text-neutral-500">{user.email}</p>}
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3.5 text-sm font-medium text-neutral-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                Log out
              </button>
            </form>
          </div>

          <p className="text-sm text-neutral-600">
            Ikutin dua langkah simple ini, abis itu Lo tinggal pake shortcutnya doang di iPhone Lo.
          </p>

          <div className="grid gap-1.5" aria-label="Kemajuan">
            <div className="grid grid-cols-2 gap-1.5">
              <span className={`h-1.5 rounded-full ${st.sheets ? "bg-emerald-500" : "bg-neutral-900"}`} />
              <span className={`h-1.5 rounded-full ${st.iphone ? "bg-emerald-500" : st.sheets ? "bg-neutral-900" : "bg-neutral-200"}`} />
            </div>
            <p className="text-xs text-neutral-500">
              {allDone ? "Semua langkah kelar." : `Langkah ${st.sheets ? 2 : 1} dari 2`}
            </p>
          </div>
        </header>

        {allDone && (
          <section className={`${card} grid gap-3`}>
            <h2 className="font-semibold">Udah siap semua</h2>
            <p className="text-sm text-neutral-600">
              Google Sheets sama iPhone Lo udah nyambung. Mulai sekarang, tiap struk yang Lo foto lewat
              Shortcut “{SHORTCUT_NAME}” kecatet otomatis.
            </p>
            <p className="text-sm text-neutral-600">
              Abis ini bakal ada panduan singkat buat nyalain triggernya.
            </p>
            <Link href="/?tips=1" className={primary}>
              Ke dashboard
            </Link>
          </section>
        )}

        {!allDone && (
          <>
            <section className={`${card} grid gap-3`}>
              <h2 className="font-semibold">1. Connect Google Sheets {st.sheets && "✓"}</h2>
              <p className="text-sm text-neutral-600">
                Udah connect aja biar pengeluaran Lo otomatis kecatet di Sheets. Kalo nggak mau,
                tinggal dimatiin nanti di halaman Devices.
              </p>
              {st.sheets ? (
                <p className="text-sm">Nyambung sebagai {st.googleEmail ?? "akun Google"}.</p>
              ) : (
                <>
                  {flash && FLASH[flash] && (
                    <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                      {FLASH[flash]}
                    </p>
                  )}
                  <a href="/api/sheets/connect?return=/connect" className={primary}>
                    {reconnect ? "Connect ulang" : "Connect Google Sheets"}
                  </a>
                </>
              )}
            </section>

            <section className={`${card} grid gap-3 ${locked ? "opacity-50" : ""}`}>
              <h2 className="font-semibold">
                {locked || st.iphone ? "2. iPhone" : iphone ? "2. Connect iPhone Lo!" : "2. Lanjut dari iPhone Lo"}{" "}
                {st.iphone && "✓"}
              </h2>
              {locked ? (
                <p className="text-sm text-neutral-600">Beresin langkah 1 dulu, baru iPhone Lo bisa di-connect.</p>
              ) : iphone ? (
                <>
                  <p className="text-sm text-neutral-600">
                    Ikutin aja biar iPhone Lo nyambung ke website ini.
                  </p>
                  <div className="grid gap-2">
                    <p className="text-sm font-medium">A. Pasang Shortcut</p>
                    <p className="text-sm text-neutral-600">
                      Wajib dipasang biar pengeluaran Lo kecatet otomatis. Ketuk Tambahkan Shortcut, terus
                      balik ke sini.
                    </p>
                    {config.shortcutInstallUrl ? (
                      <a
                        href={config.shortcutInstallUrl}
                        className="inline-flex h-11 w-full items-center justify-center rounded-md border border-neutral-300 text-sm font-medium"
                      >
                        Pasang Shortcut
                      </a>
                    ) : (
                      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                        Admin: SHORTCUT_INSTALL_URL belum diisi, jadi link Shortcut-nya belum bisa dipake.
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <p className="text-sm font-medium">B. Connect iPhone Lo</p>
                    <p className="text-sm text-neutral-600">
                      Shortcut kebuka bentar, muncul “Connected”. Abis itu balik ke sini, bos.
                    </p>
                    <form method="post" action="/api/connect/approve">
                      <button className={primary}>Connect iPhone</button>
                    </form>
                  </div>
                  <a href="/connect" className="text-center text-sm text-neutral-500 underline">
                    Udah kelar? Cek lagi
                  </a>
                </>
              ) : st.iphone ? (
                <p className="text-sm">iPhone Lo udah nyambung.</p>
              ) : (
                <>
                  <p className="text-sm text-neutral-600">
                    Scan QR ini pake kamera iPhone, terus login pake akun Google yang sama. Halaman ini bakal lanjut sendiri begitu iPhone Lo nyambung.
                  </p>
                  {qr && (
                    <div
                      role="img"
                      aria-label="Kode QR buat buka halaman ini di iPhone"
                      className="mx-auto w-48 [&>svg]:h-auto [&>svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: qr }}
                    />
                  )}
                  <CopyLink url={url} />
                  <IphonePoller />
                </>
              )}
            </section>
          </>
        )}
        <p className="text-center text-xs text-neutral-500">
          <Link href="/privacy" className="underline">
            Kebijakan Privasi
          </Link>
        </p>
      </div>
    </div>
  );
}
