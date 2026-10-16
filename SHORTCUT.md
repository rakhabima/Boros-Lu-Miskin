# iPhone Shortcuts: receipt capture

Two Shortcuts. **Connect** runs once per phone and stores a device token.
**Simpan Struk** runs every time and sends a screenshot to `/api/receipts`.

Replace `https://APP` with your app origin (e.g. `https://<app>.vercel.app`).

## 1. Connect (one time)

1. On the web app, open **Devices** → **Generate connect code**. The code is
   single use and expires in 10 minutes.
2. Build this Shortcut on the phone:

| # | Action | Settings |
|---|--------|----------|
| 1 | **Ask for Input** | Input Type: Text. Prompt: `Kode koneksi` |
| 2 | **Get Device Details** | Device Name |
| 3 | **Get Contents of URL** | URL `https://APP/api/devices/connect`. Method **POST**. Request Body **JSON**: `code` (Text) = *Provided Input*, `name` (Text) = *Device Name* |
| 4 | **Get Dictionary Value** | Key `token` from *Contents of URL* |
| 5 | **Save File** | Input: *Dictionary Value*. Ask Where to Save **off**. Destination path `Shortcuts/expense-token.txt`. Overwrite If File Exists **on** |
| 6 | **Get Dictionary Value** | Key `message` from *Contents of URL* |
| 7 | **Show Notification** | *Dictionary Value* |

3. Run it and type the code. The notification should say `Perangkat terhubung.`

The token is shown only once. If the phone is lost, revoke it on **Devices**
and connect again.

## 2. Simpan Struk (every receipt)

| # | Action | Settings |
|---|--------|----------|
| 1 | **Take Screenshot** | (or use the Shortcut from the Share Sheet with Images as input) |
| 2 | **Resize Image** | Width **1000**, Height *Auto* |
| 3 | **Convert Image** | Format **JPEG**, Quality ~0.8, Preserve Metadata **off** |
| 4 | **Base64 Encode** | Line Breaks: **None** |
| 5 | **Get File** | Path `Shortcuts/expense-token.txt`, Error If Not Found **on** |
| 6 | **Text** | `Bearer ` followed by the *File* variable from step 5 |
| 7 | **Get Contents of URL** | URL `https://APP/api/receipts`. Method **POST**. Headers: `Authorization` = *Text* (step 6). Request Body **JSON**: `mime` (Text) = `image/jpeg`, `image` (Text) = *Base64 Encoded* (step 4) |
| 8 | **Get Dictionary Value** | Key `message` from *Contents of URL* |
| 9 | **Show Notification** | *Dictionary Value* |

Step 6 reads the Base64 output from step 4 by name, so keep the variable
references explicit (tap the variable and pick the right step), not "Magic"
input from the previous action.

### Response

Always JSON, also on errors:

```json
{ "ok": true, "message": "Tersimpan: Indomaret Rp 12.000 (Food)",
  "merchant": "Indomaret", "total": 12000, "category": "Food",
  "date": "2026-10-10", "duplicate": false, "needs_review": false }
```

`message` is the text to show. Possible messages: saved, saved but needs
review, already saved (duplicate), rate limited or daily cap reached, total
not readable, server or model failure. Failed attempts appear on **Devices**.

## Troubleshooting

Error codes are listed under **Devices → Recent failed receipts**.

| Message | What to do |
|---------|------------|
| `Tersimpan: …` | Nothing. |
| `Tersimpan, perlu dicek: …` | Open the app and fix the date, merchant or amount on the row marked **Review**. Saving the edit clears the mark. |
| `Tersimpan, tapi mirip struk yang baru saja disimpan: …` | Same amount and merchant as a receipt saved in the last 10 minutes. If it is the same transaction, delete one; otherwise just save it to clear **Review**. |
| `Struk ini sudah pernah disimpan.` | Nothing. This exact image is already saved. |
| `Perangkat belum terhubung atau sudah dicabut.` | The token is missing, wrong or revoked. Run **Connect** again with a new code. |
| `Terlalu banyak kiriman. Coba lagi nanti.` | Hourly limit hit (per device or per network). Wait up to an hour. |
| `Batas harian struk tercapai. Coba lagi besok.` | Daily cap hit. Enter it manually, or raise `RECEIPT_DAILY_CAP`. |
| `Gambar terlalu besar.` | Check the **Resize Image** (width 1000) and **Convert Image** (JPEG) steps. |
| `Gambar harus JPEG atau PNG.` | Check **Convert Image** is JPEG and **Base64 Encode** has Line Breaks: None. |
| `Format kiriman salah.` | The JSON body needs keys `mime` = `image/jpeg` and `image` = the Base64 text. |
| `Waktu habis saat membaca struk. Coba lagi.` | Run again. If it keeps happening, check 9router on the VPS. |
| `Gagal membaca struk. Coba lagi.` | Run again. If it persists, look at the error code: `provider_401` wrong `NINEROUTER_KEY`, `provider_404` wrong `NINEROUTER_URL`, `provider_400` model `NINEROUTER_MODEL` rejected the request, `not_configured` env vars missing, `provider_5xx`/`network_error` 9router down. |
| `Struk tidak terbaca. Coba foto yang lebih jelas.` | The model did not return JSON. Retake with the whole receipt in view. |
| `Total tidak terbaca. Catat manual ya.` | Nothing was saved. Add the expense by hand. |
| `Data struk tidak valid. Catat manual ya.` | Nothing was saved (amount out of range). Add it by hand. |
| `Terjadi kesalahan server. Coba lagi.` | Run again; if it repeats, check the server logs. |
| `Kode salah atau kedaluwarsa.` (Connect) | Generate a new code on **Devices**; codes are single use and last 10 minutes. |
| `Terlalu banyak percobaan. Coba lagi nanti.` (Connect) | Wait 15 minutes. |

## Limits

- Request ≤ 4 MB, decoded image ≤ 3 MB, JPEG or PNG only (checked by bytes).
  A 1000 px wide JPEG is usually 100 to 300 KB.
- 20 receipts/hour per device, 30/hour per IP, `RECEIPT_DAILY_CAP` per user per day.
- The same image is never saved twice while its expense exists.

## Behind Nginx (VPS, later)

```nginx
client_max_body_size 5m;
proxy_read_timeout 60s;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

The app takes the **last** `X-Forwarded-For` entry, i.e. the one Nginx
appended, so a client cannot spoof its IP for rate limiting. Do not put a
second proxy (e.g. Cloudflare) in front without revisiting `clientIp()`.
