import test from "node:test";
import assert from "node:assert/strict";
import {
  token,
  digest,
  equal,
  pairingCode,
  Limiter,
  validSignal,
} from "../server/security.mjs";
test("pairing credentials are unpredictable and fixed length", () => {
  const set = new Set(Array.from({ length: 1000 }, token));
  assert.equal(set.size, 1000);
  for (const t of set) assert.equal(t.length, 43);
  for (let i = 0; i < 100; i++) assert.match(pairingCode(), /^\d{6}$/);
});
test("credential comparison rejects missing, truncated and unrelated inputs", () => {
  const t = token();
  assert.ok(equal(t, t));
  assert.ok(!equal(t, t.slice(1)));
  assert.ok(!equal(undefined, t));
  assert.ok(!equal(null, null));
  assert.notEqual(digest(t), t);
});
test("rate limit prevents repeated pairing guesses independently by source", () => {
  const l = new Limiter();
  for (let i = 0; i < 5; i++) assert.ok(l.allow("attacker"));
  assert.ok(!l.allow("attacker"));
  assert.ok(l.allow("new-device"));
});
test("only bounded SDP and ICE may pass the signal relay", () => {
  assert.ok(validSignal({ type: "offer", sdp: "v=0" }));
  assert.ok(
    validSignal({ type: "ice", candidate: { candidate: "candidate:1" } }),
  );
  assert.ok(!validSignal({ type: "offer", sdp: "x".repeat(100001) }));
  assert.ok(!validSignal({ type: "input", key: "a" }));
  assert.ok(!validSignal({ type: "ice", candidate: { candidate: 123 } }));
});
