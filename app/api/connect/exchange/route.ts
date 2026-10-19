import { exchangeConnectCode, isInsecure } from "@/lib/devices";
import { checkRateLimit, clientIp, CONNECT_IP_LIMIT } from "@/lib/rateLimit";

const INVALID = "Kode tidak valid atau sudah kedaluwarsa. Hubungkan ulang dari halaman /connect.";

/**
 * Public, rate limited by IP. The Shortcut receives the code from
 * /api/connect/approve and trades it here for a device token, returned once.
 * Any bad, expired or already-used code gets the same generic answer.
 */
export async function POST(req: Request) {
  if (isInsecure(req)) {
    return Response.json({ ok: false, message: "HTTPS wajib." }, { status: 403 });
  }
  const ip = await clientIp();
  const rate = await checkRateLimit(`connect:ip:${ip}`, CONNECT_IP_LIMIT.limit, CONNECT_IP_LIMIT.windowSec);
  if (!rate.allowed) {
    return Response.json({ ok: false, message: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const name = (typeof body?.device_name === "string" && body.device_name.trim().slice(0, 64)) || "iPhone";
  const token = code ? await exchangeConnectCode(code, name) : null;
  if (!token) return Response.json({ ok: false, message: INVALID }, { status: 400 });
  return Response.json({ ok: true, message: "Terhubung.", token });
}
