import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/lib/config";
import { APP_LOGO, APP_NAME } from "@/lib/branding";

export const metadata: Metadata = { title: `Kebijakan Privasi · ${APP_NAME}` };

// Public: lives outside the (app) group, so no login and no onboarding gate.
// Every statement below was checked against the code; see the PR notes before editing.
const UPDATED = "21 Oktober 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const ul = "list-disc pl-5 grid gap-1";

export default function PrivacyPage() {
  const email = config.privacyContactEmail;
  return (
    <div className="min-h-screen py-8">
      <article className="max-w-2xl mx-auto px-4 grid grid-cols-[minmax(0,1fr)] gap-6 text-sm leading-relaxed text-neutral-700">
        <header className="grid gap-1">
          <h1 className="text-2xl font-semibold text-neutral-900">
            {APP_LOGO} Kebijakan Privasi
          </h1>
          <p className="text-neutral-500">
            {APP_NAME} · Terakhir diperbarui: {UPDATED}
          </p>
        </header>

        <section className="rounded-xl border border-neutral-200 bg-white p-4 grid gap-1">
          <h2 className="font-semibold text-neutral-900">Ringkasan singkat</h2>
          <ul className={ul}>
            <li>Kami menyimpan akun dan catatan pengeluaranmu supaya aplikasi bisa bekerja.</li>
            <li>Foto struk dikirim ke model AI untuk dibaca. Fotonya tidak kami simpan.</li>
            <li>Google Sheets bersifat opsional, hanya menyentuh file yang dibuat aplikasi ini, dan bisa diputus kapan saja.</li>
            <li>Kami tidak menjual datamu dan tidak memakainya untuk iklan.</li>
          </ul>
        </section>

        <Section title="1. Data yang kami simpan">
          <ul className={ul}>
            <li>
              <strong>Akun:</strong> nama dan email. Masuk hanya lewat Google: ID akun Google, email, nama,
              dan alamat foto profil Google (izin <em>profile</em> dan <em>email</em>). Akun lama yang
              dulu dibuat dengan kata sandi mungkin masih menyimpan hash kata sandi di database; hash
              itu tidak lagi dipakai untuk masuk.
            </li>
            <li>
              <strong>Pengeluaran:</strong> jumlah, kategori, tanggal, dan catatan/daftar item. Untuk
              struk, kami juga menyimpan nama toko, daftar item, tingkat keyakinan model, penanda
              “perlu dicek”, dan hash SHA-256 dari foto (untuk mendeteksi struk ganda), bukan fotonya.
            </li>
            <li>
              <strong>Perangkat iPhone:</strong> nama perangkat, 8 karakter awal token, hash token,
              dan waktu terakhir dipakai. Riwayat percobaan membaca struk menyimpan status, kode
              error, nama model, dan durasi.
            </li>
            <li>
              <strong>Google Sheets (jika dihubungkan):</strong> email Google yang dipakai, ID dan
              tautan spreadsheet, status koneksi, dan refresh token terenkripsi.
            </li>
            <li>
              <strong>Sesi dan pembatas laju:</strong> ID sesi di cookie (httpOnly), dan penghitung
              sementara berdasarkan alamat IP atau akun untuk membatasi penyalahgunaan. Penghitung
              ini kedaluwarsa sendiri.
            </li>
          </ul>
        </Section>

        <Section title="2. Foto struk">
          <p>
            Foto yang dikirim Shortcut diproses di memori server, dikirim ke gateway AI milik kami
            (berjalan di server kami sendiri), lalu diteruskan ke model Gemini milik Google untuk
            membaca struk (nama toko, tanggal, total, item). Aplikasi sendiri tidak menyimpan foto ke
            database maupun disk; yang disimpan hanya hasil bacaannya dan hash foto untuk mendeteksi
            struk ganda.
          </p>
        </Section>

        <Section title="3. Insight AI">
          <p>
            Saat kamu memakai fitur Insight AI, aplikasi mengirim ke OpenRouter (layanan penghubung
            model AI): total pengeluaran dan total per kategori untuk bulan ini (atau bulan lalu, atau
            seluruh waktu jika belum ada data), pertanyaanmu, dan hingga 10 pesan percakapan terakhir.
            Nama toko, catatan, daftar item, nama, dan emailmu tidak ikut dikirim.
          </p>
        </Section>

        <Section title="4. Google Sheets">
          <ul className={ul}>
            <li>
              Hanya meminta izin <code>drive.file</code>: aplikasi hanya bisa membuka spreadsheet yang
              dibuatnya sendiri, bukan file Drive-mu yang lain.
            </li>
            <li>
              Menulis satu baris untuk setiap struk yang kamu foto: waktu catat, tanggal, toko, kategori,
              total, item, dan penanda “perlu dicek”.
            </li>
            <li>
              Izin ini diminta saat masuk dengan Google, dan bisa juga dihubungkan nanti dari halaman
              Devices.
            </li>
            <li>Refresh token disimpan terenkripsi (AES-256-GCM); token akses hanya ada di memori.</li>
            <li>
              Kamu bisa memutus koneksi kapan saja di halaman Devices. Token dicabut di Google (dengan
              upaya terbaik) dan catatan koneksi kami dihapus. <strong>Spreadsheet-mu tidak dihapus.</strong>
            </li>
          </ul>
        </Section>

        <Section title="5. Pernyataan data pengguna Google API">
          <p>
            Penggunaan dan transfer informasi yang diterima dari Google API oleh aplikasi ini mematuhi{" "}
            <a
              className="underline"
              href="https://developers.google.com/terms/api-services-user-data-policy"
            >
              Kebijakan Data Pengguna Layanan Google API
            </a>
            , termasuk persyaratan Penggunaan Terbatas (Limited Use).
          </p>
          <p>
            <em>
              {APP_NAME}&apos;s use and transfer to any other app of information received from Google
              APIs will adhere to the Google API Services User Data Policy, including the Limited Use
              requirements.
            </em>
          </p>
          <p>
            Data pengguna Google hanya dipakai untuk menyediakan fitur sinkronisasi Google Sheets. Data
            itu tidak dijual, tidak dipakai untuk iklan, dan tidak dipakai untuk melatih model AI.
          </p>
        </Section>

        <Section title="6. Pihak yang memproses data">
          <p>Kami tidak menjual datamu. Data diproses oleh:</p>
          <ul className={ul}>
            <li>Penyedia hosting dan database aplikasi ini (menyimpan akun dan pengeluaran).</li>
            <li>Gateway AI di server kami sendiri dan model Gemini milik Google (membaca foto struk).</li>
            <li>OpenRouter dan model AI yang dipakainya (fitur Insight AI).</li>
            <li>Google (login Google dan, jika dihubungkan, Google Sheets).</li>
          </ul>
        </Section>

        <Section title="7. Keamanan">
          <ul className={ul}>
            <li>Token perangkat dan kode koneksi disimpan sebagai hash; kode koneksi berlaku sekali dan kedaluwarsa dalam 5 menit.</li>
            <li>Refresh token Google Sheets dienkripsi, terikat ke akunmu.</li>
            <li>Hash kata sandi lama (bcrypt), jika ada, tidak lagi dipakai untuk masuk.</li>
            <li>Cookie sesi bersifat httpOnly dan hanya dikirim lewat HTTPS di produksi.</li>
          </ul>
        </Section>

        <Section title="8. Kendali dan penghapusan data">
          <p>
            Kamu bisa mengubah atau menghapus pengeluaran di aplikasi, mencabut iPhone, dan memutus
            Google Sheets di halaman Devices. Untuk menghapus akun dan seluruh datamu, kirim permintaan
            ke{" "}
            {email ? (
              <a className="underline" href={`mailto:${email}`}>
                {email}
              </a>
            ) : (
              <strong>[alamat email kontak belum diatur oleh pengelola]</strong>
            )}
            .
          </p>
        </Section>

        <footer className="border-t border-neutral-200 pt-4 text-neutral-500">
          <Link href="/login" className="underline">
            Kembali ke aplikasi
          </Link>
        </footer>
      </article>
    </div>
  );
}
