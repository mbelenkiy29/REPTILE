// Signed, expiring state for the GitHub App install round trip (prevents linking someone else's install flow).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is missing");
  return s;
};

export function signState(payload: { orgId: string; userId: string }, ttlSeconds = 3600): string {
  const body = Buffer.from(JSON.stringify({ ...payload, n: randomBytes(8).toString("hex"), exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string | null): { orgId: string; userId: string } | null {
  if (!state) return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret()).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { orgId: string; userId: string; exp: number };
    return p.exp > Date.now() ? { orgId: p.orgId, userId: p.userId } : null;
  } catch {
    return null;
  }
}
