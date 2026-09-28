import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
const origin = "http://localhost:3445";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function inbox(ws) {
  const queued = [];
  const pending = [];
  ws.on("message", (data) => {
    const m = JSON.parse(data);
    const i = pending.findIndex((p) => p.type === m.type);
    if (i >= 0) {
      const p = pending.splice(i, 1)[0];
      clearTimeout(p.timer);
      p.resolve(m);
    } else queued.push(m);
  });
  return (type) => {
    const i = queued.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(queued.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const entry = {
        type,
        resolve,
        timer: setTimeout(
          () => reject(Error(`Timeout waiting for ${type}`)),
          6000,
        ),
      };
      pending.push(entry);
    });
  };
}
const open = (ws) =>
  new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
test(
  "authenticated pairing, approval, scoped signaling, rejection and revocation",
  { timeout: 25000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), "deskdeck-test-"));
    const child = spawn(
      process.execPath,
      ["server/index.mjs", "--dev", "--api-only"],
      {
        env: {
          ...process.env,
          PORT: "3445",
          PUBLIC_ORIGIN: origin,
          DATA_DIR: dir,
        },
        stdio: "pipe",
      },
    );
    let log = "";
    child.stderr.on("data", (d) => (log += d));
    const sockets = [];
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          if ((await fetch(origin + "/api/status")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await delay(100);
      }
      assert.ok(ready, log);
      const config = JSON.parse(readFileSync(join(dir, "host.json"), "utf8"));
      const host = new WebSocket(origin.replace("http", "ws") + "/signal", {
        headers: { Authorization: `Bearer ${config.secret}` },
      });
      sockets.push(host);
      const hm = inbox(host);
      await open(host);
      const initial = await hm("code");
      host.send(JSON.stringify({ type: "hello", name: "Integration Mac" }));
      const post = (code, otherOrigin = origin) =>
        fetch(origin + "/api/pair", {
          method: "POST",
          headers: { Origin: otherOrigin, "Content-Type": "application/json" },
          body: JSON.stringify({ code, name: "Test Quest" }),
        });
      assert.equal(
        (await post(initial.code, "https://attacker.invalid")).status,
        403,
      );
      assert.equal((await post("000000")).status, 403);
      let granted = false;
      const pairing = post(initial.code).then((r) => {
        granted = true;
        return r;
      });
      const approval = await hm("approval");
      await delay(50);
      assert.equal(granted, false, "pairing must wait for host consent");
      host.send(
        JSON.stringify({ type: "approval", id: approval.id, allow: true }),
      );
      const response = await pairing;
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie");
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Strict/);
      const header = cookie.split(";")[0];
      const status = await (
        await fetch(origin + "/api/status", { headers: { Cookie: header } })
      ).json();
      assert.equal(status.paired, true);
      const client = new WebSocket(origin.replace("http", "ws") + "/signal", {
        headers: { Origin: origin, Cookie: header },
      });
      sockets.push(client);
      const cm = inbox(client);
      await open(client);
      await cm("ready");
      client.send(JSON.stringify({ type: "connect" }));
      const session = await cm("session");
      assert.equal((await hm("start")).session, session.session);
      client.send(
        JSON.stringify({
          type: "offer",
          session: session.session,
          sdp: "v=0\r\n",
        }),
      );
      assert.equal((await hm("offer")).sdp, "v=0\r\n");
      host.send(
        JSON.stringify({
          type: "answer",
          session: session.session,
          sdp: "v=0\r\n",
        }),
      );
      assert.equal((await cm("answer")).session, session.session);
      const outsider = new WebSocket(origin.replace("http", "ws") + "/signal", {
        headers: { Origin: origin },
      });
      sockets.push(outsider);
      await assert.rejects(open(outsider), /401/);
      const crossed = new WebSocket(origin.replace("http", "ws") + "/signal", {
        headers: { Origin: "https://attacker.invalid", Cookie: header },
      });
      sockets.push(crossed);
      await assert.rejects(open(crossed), /401/);
      const refreshed = await hm("code");
      host.send(
        JSON.stringify({ type: "revoke", id: refreshed.devices[0].id }),
      );
      await cm("ended");
      assert.equal(
        (
          await (
            await fetch(origin + "/api/status", { headers: { Cookie: header } })
          ).json()
        ).paired,
        false,
      );
      const stored = JSON.parse(
        readFileSync(join(dir, "devices.json"), "utf8"),
      );
      assert.equal(stored.length, 0);
    } finally {
      for (const s of sockets) s.terminate();
      child.kill();
      await new Promise((r) => child.once("exit", r));
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
