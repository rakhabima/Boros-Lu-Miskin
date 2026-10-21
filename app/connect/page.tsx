import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { syncOnboarding } from "@/lib/onboarding";
import { connectUrl, isIphone } from "@/lib/onboardingCore";
import { qrSvg } from "@/lib/qr";
import { APP_LOGO, APP_NAME, SHORTCUT_NAME } from "@/lib/branding";
import { CopyLink, IphonePoller } from "@/components/ConnectClient";

const RETRY_DRIVE = "Akses Google Drive diperlukan. Centang izin Drive di layar Google, lalu coba lagi.";
const RETRY_GENERIC = "Gagal menghubungkan Google Sheets. Coba lagi.";
const FLASH: Record<string, string> = {
  denied: RETRY_DRIVE,
  scope_denied: RETRY_DRIVE,
  no_refresh: RETRY_GENERIC,
  state_error: RETRY_GENERIC,
  not_configured: "Google Sheets belum dikonfigurasi di server. Hubungi admin.",
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
  if (st.justCompleted) redirect("/");

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
        <header>
          <h1 className="text-xl font-semibold">
            {APP_LOGO} {APP_NAME}
          </h1>
          <p className="text-sm text-neutral-600">
            Masuk sebagai {user.name}.{" "}
            {allDone ? "Semua langkah selesai." : `Langkah ${st.sheets ? 2 : 1} dari 2`}
          </p>
        </header>

        {allDone && (
          <section className={`${card} grid gap-3`}>
            <h2 className="font-semibold">Semua siap</h2>
            <p className="text-sm text-neutral-600">
              Google Sheets dan iPhone sudah terhubung. Foto struk lewat Shortcut “{SHORTCUT_NAME}”
              akan tercatat otomatis.
            </p>
            <Link href="/" className={primary}>
              Ke dashboard
            </Link>
          </section>
        )}

        {!allDone && (
          <>
            <section className={`${card} grid gap-3`}>
              <h2 className="font-semibold">1. Google Sheets {st.sheets && "✓"}</h2>
              <p className="text-sm text-neutral-600">
                Setiap struk disalin ke spreadsheet di Google Drive-mu sendiri. Aplikasi hanya bisa
                membuka file yang dibuatnya sendiri, dan kamu bisa mematikan salinan ini nanti di
                /devices.
              </p>
              {st.sheets ? (
                <p className="text-sm">Terhubung sebagai {st.googleEmail ?? "akun Google"}.</p>
              ) : (
                <>
                  {flash && FLASH[flash] && (
                    <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                      {FLASH[flash]}
                    </p>
                  )}
                  <a href="/api/sheets/connect?return=/connect" className={primary}>
                    {reconnect ? "Hubungkan ulang" : "Hubungkan Google Sheets"}
                  </a>
                </>
              )}
            </section>

            <section className={`${card} grid gap-3 ${locked ? "opacity-50" : ""}`}>
              <h2 className="font-semibold">2. iPhone {st.iphone && "✓"}</h2>
              {locked ? (
                <p className="text-sm text-neutral-600">Selesaikan langkah 1 dulu.</p>
              ) : iphone ? (
                <>
                  <p className="text-sm text-neutral-600">A. Pasang Shortcut “{SHORTCUT_NAME}”.</p>
                  {config.shortcutInstallUrl ? (
                    <a
                      href={config.shortcutInstallUrl}
                      className="inline-flex h-11 w-full items-center justify-center rounded-md border border-neutral-300 text-sm font-medium"
                    >
                      Pasang Shortcut
                    </a>
                  ) : (
                    <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                      Admin: SHORTCUT_INSTALL_URL belum diisi, jadi tautan Shortcut belum tersedia.
                    </p>
                  )}
                  <p className="text-sm text-neutral-600">B. Hubungkan iPhone ini ke akunmu.</p>
                  <form method="post" action="/api/connect/approve">
                    <button className={primary}>Hubungkan iPhone</button>
                  </form>
                  <a href="/connect" className="text-center text-sm text-neutral-500 underline">
                    Sudah selesai? Periksa lagi
                  </a>
                </>
              ) : st.iphone ? (
                <p className="text-sm">iPhone sudah terhubung.</p>
              ) : (
                <>
                  <p className="text-sm text-neutral-600">
                    Buka di iPhone-mu, lalu masuk dengan akun yang sama.
                  </p>
                  {qr && (
                    <div
                      role="img"
                      aria-label="Kode QR untuk membuka halaman ini di iPhone"
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
      </div>
    </div>
  );
}
