import { exchangeConnectCode } from "@/lib/devices";
import { checkRateLimit, clientIp, CONNECT_IP_LIMIT } from "@/lib/rateLimit";

/** One-time: the connect Shortcut trades a code from /devices for a bearer token. */
export async function POST(req: Request) {
  const ip = await clientIp();
  const rate = await checkRateLimit(`connect:ip:${ip}`, CONNECT_IP_LIMIT.limit, CONNECT_IP_LIMIT.windowSec);
  if (!rate.allowed) {
    return Response.json({ ok: false, message: "Terlalu banyak percobaan. Coba lagi nanti." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const name = (typeof body?.name === "string" && body.name.trim().slice(0, 64)) || "iPhone";
  const token = code ? await exchangeConnectCode(code, name) : null;
  if (!token) {
    return Response.json({ ok: false, message: "Kode salah atau kedaluwarsa." }, { status: 400 });
  }
  return Response.json({ ok: true, message: "Perangkat terhubung.", token });
}
