# Google Sheets mirror

Each user connects **their own** Google account on **/devices → Google
Sheets**. The app creates a spreadsheet named "Boros Lu Miskin" in their
Drive and appends one row per receipt expense.

- Postgres is the source of truth. Sheets is a one-way copy: edits and
  deletes in the app are **not** propagated.
- Separate OAuth grant from login, scope `drive.file` only: the app can open
  only files it created, never the rest of the user's Drive.
- The refresh token is stored AES-256-GCM encrypted; access tokens live only
  in memory for one append.
- Mirroring runs after the receipt response. A Google failure never fails or
  slows the receipt; it only changes the connection status on /devices.

Columns (sheet tab "Pengeluaran"): Waktu Catat (when the expense was saved,
Asia/Jakarta `yyyy-MM-dd HH:mm:ss`), Tanggal (receipt date), Merchant,
Kategori, Total, Items (the item list), Perlu dicek. Spreadsheets created
before this layout keep their old header. Written with
`USER_ENTERED`, so timestamps, dates and amounts are real date-times and numbers; text that
starts with `= + - @` is prefixed with `'` so it can never run as a formula.

## Onboarding

Connecting Sheets is step 1 of the mandatory onboarding gate (see
`docs/shortcut-setup.md`). `/connect` starts the grant with
`/api/sheets/connect?return=/connect`; the callback sends the user back to
`/connect?sheets=<flag>`. Only `/connect` and `/devices` are accepted as return
paths (anything else lands on `/devices`), and the choice is carried inside the
signed `state`. Denied consent, an unticked Drive box (`scope_denied`) and
errors show a retry message there. Step 1 counts as done only while the
connection is `active`. Disconnecting later does not re-lock an onboarded user.

**Keep `ONBOARDING_GATE_ENABLED` off in production until the Google consent
screen is published and `SHORTCUT_INSTALL_URL` is set.** With the consent
screen still in Testing, only listed test users can finish step 1, so new
sign-ups would be locked out. With no install URL the gate refuses to turn on
(the server logs a warning at startup).

## Google login (the only way in)

There is one button, "Lanjutkan dengan Google" (`/api/auth/google`), for
sign-in and sign-up. Password login was removed (`users.password_hash` is kept
but unused). Every login asks for `profile email` plus `drive.file`, with
`access_type=offline` and `prompt=select_account`. It does not force
`prompt=consent` and does not use `include_granted_scopes`, so Google decides
when to show the consent screen. `?intent=signup` (old links) is accepted and
behaves the same.

The callback matches the Google account to an existing user by Google id, or by
verified email (case-insensitive), and links the id: no duplicate accounts.

Only when the token response has a refresh token AND `drive.file` was granted,
`finishConnect()` (the same code as the /devices flow) creates the
spreadsheet, stores the encrypted refresh token and turns mirroring on:

- new account: always;
- existing account: only if it has no `active` connection (Google usually
  returns no refresh token on later logins, so nothing happens); an active
  one is never overwritten;
- Drive unticked, no refresh token, Sheets not configured, or any Google
  error: login still succeeds and nothing is stored (the error is logged
  without tokens). Step 1 on `/connect` stays open and offers the button again.

A new account lands on `/connect`. The callback never completes onboarding;
`syncOnboarding()` does, once both steps are really done.

## Google Cloud setup (once)

Use the same Google Cloud project and OAuth client as login.

1. **APIs & Services → Library**: enable **Google Sheets API** and
   **Google Drive API**.
2. **Google Auth Platform → Branding / Audience / Data access** (the OAuth
   consent screen):
   - App name, support email, developer email.
   - Data access → Add scope `https://www.googleapis.com/auth/drive.file`
     (non-sensitive; no Google verification review needed for it).
   - Audience → **Publish app** so the status is **In production**. In
     "Testing", refresh tokens expire after 7 days and only listed test
     users can connect.
3. **Clients → your web client → Authorized redirect URIs**: add
   - `http://localhost:3000/api/sheets/callback` (local)
   - `https://<your-domain>/api/sheets/callback` (production)
4. Generate the encryption key:
   ```sh
   openssl rand -base64 32
   ```
5. Env vars (local `.env.local`, and Vercel → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Already set for login; reused. |
   | `SHEETS_OAUTH_REDIRECT_URI` | Exactly one of the URIs from step 3 for that environment. |
   | `SHEETS_TOKEN_ENC_KEY` | Output of step 4. Keep it secret and stable: changing it makes every stored token unreadable (users see "Hubungkan ulang"). |
   | `SHEETS_LEGACY_WEBHOOK_EMAILS` | Optional. Emails still allowed to use the old shared `SHEETS_WEBHOOK_URL`. |

If the redirect URI or key is missing, **Hubungkan Google Sheets** shows
"Google Sheets belum dikonfigurasi di server." and the server log names the
missing variable.

## Legacy shared webhook

`SHEETS_WEBHOOK_URL` (the old Apps Script) is used **only** for users whose
email is in `SHEETS_LEGACY_WEBHOOK_EMAILS` and who have no per-user
connection. For everyone else it is never called and its toggle is not shown.
Once the owner connects their own Google account, the per-user spreadsheet
takes over.

## Statuses

| Status | Meaning | Mirrors? |
|---|---|---|
| `active` | Last append worked (or just connected). | Yes, if the toggle is on. |
| `error` | Last append failed for a non-auth reason after 3 tries (e.g. tab renamed). | Yes, retried on the next receipt. |
| `needs_reconnect` | Access revoked/expired, token unreadable, or spreadsheet deleted. | No, until the user reconnects. |

Transient errors (429, 5xx, network) are retried up to 3 times with
backoff (0.5 s, 1.5 s). Reconnecting reuses the existing spreadsheet when the
new grant can still open it; otherwise it creates a new one. Disconnecting
revokes the token at Google and leaves the spreadsheet in the user's Drive.

## Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| `Error 400: redirect_uri_mismatch` on Google's page | `SHEETS_OAUTH_REDIRECT_URI` not listed on the OAuth client, or differs (http/https, trailing slash, port). | Add the exact URI in step 3. |
| `Error 403: access_denied` / "app has not completed verification" | Consent screen still in Testing and the account is not a test user. | Publish the app (step 2). |
| "Google Sheets belum dikonfigurasi di server." | `SHEETS_OAUTH_REDIRECT_URI` or `SHEETS_TOKEN_ENC_KEY` missing or the key is not 32 bytes. | Set them; check the server log for the name. |
| "Izin Google dibatalkan." | User pressed Cancel. | Try again. |
| "Akses Google Drive tidak dicentang." | User unticked the Drive permission. | Connect again and leave it ticked. |
| "Sesi tidak cocok atau kedaluwarsa." | Took over 10 minutes, cookies blocked, or the callback was opened in another browser or account. | Start again from /devices in the same browser. |
| Warning: "Akses Google dicabut atau kedaluwarsa." | User removed the app at myaccount.google.com/permissions, changed password, or the consent screen is in Testing (7-day expiry). | **Hubungkan ulang**; publish the app if it keeps happening. |
| Warning: "Spreadsheet tidak ditemukan (mungkin dihapus)." | The spreadsheet was deleted or moved to trash. | Restore it from Drive trash and reconnect (it is reused), or reconnect to create a new one. |
| Warning: "Token tersimpan tidak bisa dibaca." | `SHEETS_TOKEN_ENC_KEY` changed. | Restore the old key, or have users reconnect. |
| "Gagal menyalin … (google 400 …)" | Usually the "Pengeluaran" tab was renamed or deleted. | Rename it back; the next receipt retries. |
| Rows stop appearing, no warning | Toggle is off. | Turn it on in /devices. |
