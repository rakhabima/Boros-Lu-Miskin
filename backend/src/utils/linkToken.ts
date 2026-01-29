import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { config } from "../config.js";

const base64url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

type LinkTokenPayload = {
  uid: number;
  exp: number; // epoch ms
  n: string; // nonce
};

const secret = config.telegram.linkSecret;

if (!secret) {
  console.warn("[TELEGRAM] link token secret is empty; set TELEGRAM_LINK_SECRET");
}

export const signLinkToken = (userId: number, ttlMinutes = 5): string => {
  const payload: LinkTokenPayload = {
    uid: userId,
    exp: Date.now() + ttlMinutes * 60_000,
    n: randomBytes(4).toString("hex")
  };
  const payloadStr = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(payloadStr).digest();
  return `${base64url(payloadStr)}.${base64url(sig)}`;
};

export const verifyLinkToken = (token: string): LinkTokenPayload | null => {
  if (!token || !token.includes(".")) return null;
  const [payloadB64, sigB64] = token.split(".");
  try {
    const payloadStr = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
    const expectedSig = createHmac("sha256", secret).update(payloadStr).digest();
    const actualSig = Buffer.from(sigB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
      return null;
    }
    const payload = JSON.parse(payloadStr) as LinkTokenPayload;
    if (typeof payload.uid !== "number" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
};
