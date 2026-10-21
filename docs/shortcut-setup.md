# iPhone Shortcut setup

One Shortcut, named exactly **`Simpan Struk`** (the server opens it by name;
see `SHORTCUT_NAME` in `lib/branding.ts`). It has two modes:

- **Run with text input** (opened by the web app after you tap Connect): trades
  the one-time code for a device token and saves it.
- **Run with no input** (Back Tap): screenshots the screen and records it as
  an expense.

Replace `https://APP` with your app origin, e.g. `https://<app>.vercel.app`.
Production must be HTTPS; plain `http://` is refused there.

## Build the Shortcut

Shortcut settings (ⓘ): **Receive** Text, **If there's no input:** Continue.

| # | Action | Settings |
|---|--------|----------|
| 1 | **If** | *Shortcut Input* **has any value** |
| 2 | ↳ **Get Device Details** | Device Name |
| 3 | ↳ **Get Contents of URL** | `https://APP/api/connect/exchange`. Method **POST**. Request Body **JSON**: `code` (Text) = *Shortcut Input*, `device_name` (Text) = *Device Name* |
| 4 | ↳ **Get Dictionary Value** | Key `token` from *Contents of URL* |
| 5 | ↳ **If** | *Dictionary Value* **has any value** |
| 6 | ↳↳ **Save File** | Input *Dictionary Value*. Ask Where to Save **off**. Destination `Shortcuts/blm-token.txt`. Overwrite If File Exists **on** |
| 7 | ↳↳ **Show Notification** | `Connected` |
| 8 | ↳ **Otherwise** | |
| 9 | ↳↳ **Get Dictionary Value** | Key `message` from *Contents of URL* |
| 10 | ↳↳ **Show Notification** | *Dictionary Value* |
| 11 | ↳ **End If** | |
| 12 | ↳ **Stop This Shortcut** | |
| 13 | **End If** | |
| 14 | **Get File** | `Shortcuts/blm-token.txt`. Error If Not Found **off** |
| 15 | **If** | *File* **does not have any value** |
| 16 | ↳ **Open URLs** | `https://APP/connect` |
| 17 | ↳ **Stop This Shortcut** | |
| 18 | **End If** | |
| 19 | **Take Screenshot** | |
| 20 | **Resize Image** | Width **1024**, Height *Auto* |
| 21 | **Convert Image** | **JPEG**, Quality ~0.8, Preserve Metadata **off** |
| 22 | **Text** | `Bearer ` then the *File* variable from step 14 |
| 23 | **Get Contents of URL** | `https://APP/api/receipts`. Method **POST**. Headers: `Authorization` = *Text* (step 22). Request Body **Form**: `image` (File) = *Converted Image* (step 21) |
| 24 | **Get Dictionary Value** | Key `message` from *Contents of URL* (step 23) |
| 25 | **Show Notification** | *Dictionary Value* |

Tap each variable and pick the step named in the table; "Magic Variables"
that silently point at the previous action are the usual cause of a broken
Shortcut.

## Onboarding gate

When `ONBOARDING_GATE_ENABLED=true`, a new account cannot reach the dashboard
until `/connect` shows both steps done: **1. Google Sheets** connected, **2.
iPhone** connected (at least one non-revoked device with scope
`receipts:create`). Existing accounts were marked onboarded by
`migrations/2026-10-onboarding-gate.sql`, and revoking a device later never
locks anyone out again. There is no skip button.

On the iPhone, `/connect` shows **Pasang Shortcut** (the `SHORTCUT_INSTALL_URL`
link) and **Hubungkan iPhone**. On a laptop it shows a QR code and link for
`APP_BASE_URL/connect` (the request origin if unset) and waits for the iPhone,
polling `GET /api/onboarding/status` every 3 s.

**Keep `ONBOARDING_GATE_ENABLED` off in production until the Google consent
screen is published and `SHORTCUT_INSTALL_URL` is set.** With the consent
screen still in Testing, only listed test users can finish step 1, so new
sign-ups would be locked out. With no install URL the gate refuses to turn on
(the server logs a warning at startup).

## Connect (once per iPhone)

1. Run the Shortcut once. With no token it opens `https://APP/connect` in Safari.
2. Log in if asked; you come back to `/connect`.
3. Tap **Connect this iPhone to your account**. Safari asks to open
   Shortcuts; allow it. The Shortcut runs with the one-time code and shows
   **Connected**.

The code works once and expires after 5 minutes. The token is stored only on
the phone (`Shortcuts/blm-token.txt`, which syncs through iCloud Drive) and as
a hash on the server. Lost phone: **Devices → Revoke**, then connect again.

## Back Tap

Settings → Accessibility → Touch → **Back Tap** → Double Tap → **Simpan Struk**.
Open a receipt or transfer proof, double-tap the back of the phone.

## Sharing the Shortcut

Shortcuts → long-press **Simpan Struk** → Share → **Copy iCloud Link**. Set
that link as `SHORTCUT_INSTALL_URL` so `/devices` shows an install link.
Imported copies keep the same name, which the connect flow relies on.

## Messages

Every response is JSON with `ok` and a short Indonesian `message`. Failed
attempts and their error codes are listed under **Devices → Recent failed
receipts**.

| Message | What to do |
|---------|------------|
| `Connected` | Nothing. |
| `Kode tidak valid atau sudah kedaluwarsa. …` | The connect link was used, or more than 5 minutes passed. Tap Connect on `/connect` again. |
| `Tersimpan: …` | Nothing. |
| `Tersimpan, perlu dicek: …` | Open the app and fix the row marked **Review** (date, merchant, category or amount). Saving the edit clears the mark. Causes: date in the future or over a year old, no merchant, unknown category, low model confidence. |
| `Tersimpan, tapi mirip struk yang baru saja disimpan: …` | Same merchant, amount and date as a receipt saved in the last 10 minutes. Delete one if it is the same transaction; otherwise save it to clear **Review**. |
| `Struk ini sudah pernah disimpan.` | Nothing. This exact image is already saved. |
| `Perangkat belum terhubung atau sudah dicabut.` | The token is missing, wrong or revoked. Delete `Shortcuts/blm-token.txt` in Files and run the Shortcut to reconnect. |
| `Terlalu banyak kiriman. Coba lagi nanti.` | Hourly limit (per account, `RECEIPT_HOURLY_LIMIT`, default 30) or per-network limit. Wait. |
| `Batas harian struk tercapai. Coba lagi besok.` | Daily cap (`RECEIPT_DAILY_CAP`). Enter it manually. |
| `Gambar terlalu besar.` | Check **Resize Image** (1024) and **Convert Image** (JPEG). Limit 3 MB image, 4 MB request. |
| `Gambar harus JPEG atau PNG.` | Check **Convert Image** is JPEG. |
| `Format kiriman salah.` | Request body must be **Form** with a File field named `image` (or JSON `{"image": "<base64>"}`). |
| `Waktu habis saat membaca struk. Coba lagi.` | Run again. If it repeats, check 9router on the VPS. |
| `Gagal membaca struk. Coba lagi.` | Run again. If it persists, check the error code on **Devices**: `provider_401` wrong `NINEROUTER_API_KEY`, `provider_404` wrong `NINEROUTER_BASE_URL` (must end in `/v1`), `provider_400` model rejected the request (`NINEROUTER_MODEL`), `not_configured` env missing, `provider_5xx` / `network_error` 9router down. |
| `Struk tidak terbaca. Coba foto yang lebih jelas.` | The model did not return JSON. Retake with the whole receipt visible. |
| `Total tidak terbaca. Catat manual ya.` | Nothing was saved. Add it by hand. |
| `Data struk tidak valid. Catat manual ya.` | Nothing was saved (amount out of range). Add it by hand. |
| `Terjadi kesalahan server. Coba lagi.` | Run again; if it repeats, check server logs. |
| `Terlalu banyak percobaan. Coba lagi nanti.` | Too many connect attempts from this network. Wait 15 minutes. |
| `HTTPS wajib.` | The Shortcut URL uses `http://` in production. Use `https://`. |

## Behind Nginx (VPS, later)

```nginx
client_max_body_size 5m;
proxy_read_timeout 60s;
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

`Host` must be passed through or the Connect button fails its same-origin
check. The app takes the **last** `X-Forwarded-For` entry (the one Nginx
appended), so clients cannot spoof their IP for rate limiting.

Google Sheets mirroring is set up separately on /devices; see `docs/google-sheets.md`.
