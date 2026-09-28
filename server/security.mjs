import {
  randomBytes,
  randomInt,
  createHash,
  timingSafeEqual,
} from "node:crypto";
export const token = () => randomBytes(32).toString("base64url");
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export const pairingCode = () => String(randomInt(100000, 1000000));
export class Limiter {
  buckets = new Map();
  allow(key, limit = 5, window = 60000) {
    const now = Date.now();
    for (const [k, v] of this.buckets)
      if (v.until < now) this.buckets.delete(k);
    const b = this.buckets.get(key) || { count: 0, until: now + window };
    b.count++;
    this.buckets.set(key, b);
    return b.count <= limit;
  }
}
export function validSignal(m) {
  return (
    m &&
    (m.type === "offer" || m.type === "answer"
      ? typeof m.sdp === "string" && m.sdp.length < 100000
      : m.type === "ice" &&
        m.candidate &&
        typeof m.candidate.candidate === "string" &&
        m.candidate.candidate.length < 4096)
  );
}
