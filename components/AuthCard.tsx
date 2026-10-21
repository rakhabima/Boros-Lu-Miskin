import Link from "next/link";
import { APP_LOGO, APP_NAME } from "@/lib/branding";

export function AuthCard({ next = "/" }: { next?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6">
      <h1 className="text-2xl font-semibold mb-2 flex items-center gap-2">
        <span role="img" aria-label="Money with wings">
          {APP_LOGO}
        </span>
        {APP_NAME}
      </h1>
      <p className="text-sm text-neutral-600 mb-4">
        Masih boros in this economy?!?!?!?
      </p>
      <div className="flex flex-col gap-3">
        <a
          href={next === "/" ? "/api/auth/google" : `/api/auth/google?next=${encodeURIComponent(next)}`}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
        >
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 48 48">
          <path
            fill="#FFC107"
            d="M43.6 20.5H42V20H24v8h11.3C33.9 32.5 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10.5 0 19-8.5 19-19 0-1.3-.1-2.1-.4-3.5z"
          />
          <path
            fill="#FF3D00"
            d="M6.3 14.7l6.6 4.8C14.7 16.1 19 12 24 12c3.1 0 5.9 1.2 8.1 3.1l5.7-5.7C34.2 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2C29.2 35.4 26.7 36 24 36c-5.4 0-9.9-3.4-11.5-8.1l-6.6 5.1C9.2 39.7 16.1 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.6 20.5H42V20H24v8h11.3c-1.1 3-3.5 5.4-6.8 6.6l6.3 5.2C38.8 36 43 30.6 43 24c0-1.3-.1-2.1-.4-3.5z"
          />
        </svg>
          Lanjutkan dengan Google
        </a>
        <p className="text-xs text-neutral-500">
          Saat pertama kali masuk, Google akan meminta izin Google Drive. Izin ini hanya dipakai untuk
          membuat spreadsheet milikmu untuk menyimpan struk. Aplikasi hanya bisa membuka file yang
          dibuatnya sendiri, dan salinan ini bisa dimatikan nanti.{" "}
          <Link href="/privacy" className="underline">
            Kebijakan Privasi
          </Link>
        </p>
      </div>
    </div>
  );
}
