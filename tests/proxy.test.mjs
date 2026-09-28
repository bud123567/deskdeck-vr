import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { runtimeConfig } from "../server/runtime.mjs";

const publicOrigin = "https://deskdeck-proxy.test";
const proxyEnv = {
  PORT: "3446",
  PUBLIC_ORIGIN: publicOrigin,
  TLS_TERMINATION: "loopback",
};

test("production HTTP requires explicit loopback TLS termination", () => {
  assert.throws(() => runtimeConfig({}));
  assert.throws(() => runtimeConfig({ PUBLIC_ORIGIN: publicOrigin }));
  assert.throws(() =>
    runtimeConfig({ ...proxyEnv, TLS_TERMINATION: "upstream" }),
  );
  assert.equal(runtimeConfig({}, { dev: true }).secureBrowser, false);
});

test("loopback proxy keeps browser security and local host transport separate", () => {
  const config = runtimeConfig(proxyEnv);
  assert.equal(config.port, 3446);
  assert.equal(config.secure, false);
  assert.equal(config.secureBrowser, true);
  assert.equal(config.bind, "127.0.0.1");
  assert.equal(config.origin, publicOrigin);
  assert.equal(config.hostUrl, "ws://127.0.0.1:3446/signal");
  assert.equal(
    runtimeConfig({ ...proxyEnv, BIND: "127.0.0.1" }).bind,
    "127.0.0.1",
  );
});

test("loopback TLS termination cannot expose plain HTTP or mix TLS modes", () => {
  for (const bind of ["0.0.0.0", "::", "::1", "localhost", "192.0.2.1"])
    assert.throws(() => runtimeConfig({ ...proxyEnv, BIND: bind }));
  assert.throws(() =>
    runtimeConfig({
      ...proxyEnv,
      TLS_CERT: "/unused/certificate.pem",
      TLS_KEY: "/unused/private-key.pem",
    }),
  );
  assert.throws(() =>
    runtimeConfig({ ...proxyEnv, TLS_CERT: "/unused/certificate.pem" }),
  );
  assert.throws(() =>
    runtimeConfig({ ...proxyEnv, TLS_KEY: "/unused/private-key.pem" }),
  );
});

test("proxy public origin must be an unambiguous HTTPS origin", () => {
  for (const origin of [
    undefined,
    "http://deskdeck-proxy.test",
    "not-a-url",
    "https://user:password@deskdeck-proxy.test",
    "https://deskdeck-proxy.test/dashboard",
    "https://deskdeck-proxy.test?mode=proxy",
    "https://deskdeck-proxy.test#workspace",
  ])
    assert.throws(() => runtimeConfig({ ...proxyEnv, PUBLIC_ORIGIN: origin }));
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function inbox(ws) {
  const queued = [];
  const pending = [];
  ws.on("message", (data) => {
    const message = JSON.parse(data);
    const index = pending.findIndex((entry) => entry.type === message.type);
    if (index >= 0) {
      const entry = pending.splice(index, 1)[0];
      clearTimeout(entry.timer);
      entry.resolve(message);
    } else queued.push(message);
  });
  return (type) => {
    const index = queued.findIndex((message) => message.type === type);
    if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const entry = {
        type,
        resolve,
        timer: setTimeout(() => {
          pending.splice(pending.indexOf(entry), 1);
          reject(Error(`Timeout waiting for ${type}`));
        }, 6000),
      };
      pending.push(entry);
    });
  };
}
const open = (ws) =>
  new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

test(
  "production proxy preserves approval, secure cookies, private status and signaling authorization",
  { timeout: 25000 },
  async () => {
    const localOrigin = "http://127.0.0.1:3446";
    const signalUrl = "ws://127.0.0.1:3446/signal";
    const dir = mkdtempSync(join(tmpdir(), "deskdeck-proxy-test-"));
    const env = { ...process.env, ...proxyEnv, DATA_DIR: dir };
    delete env.TLS_CERT;
    delete env.TLS_KEY;
    delete env.BIND;
    const child = spawn(process.execPath, ["server/index.mjs", "--api-only"], {
      env,
      stdio: "pipe",
    });
    let log = "";
    child.stderr.on("data", (data) => (log += data));
    child.stdout.on("data", (data) => (log += data));
    const sockets = [];
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        if (child.exitCode !== null) break;
        try {
          if ((await fetch(localOrigin + "/api/status")).ok) {
            ready = true;
            break;
          }
        } catch {}
        await delay(100);
      }
      assert.ok(ready, log || "Production proxy server did not start");
      const config = JSON.parse(readFileSync(join(dir, "host.json"), "utf8"));
      assert.equal(config.url, signalUrl);
      assert.equal(config.website, publicOrigin);
      const host = new WebSocket(signalUrl, {
        headers: { Authorization: `Bearer ${config.secret}` },
      });
      sockets.push(host);
      const hm = inbox(host);
      await open(host);
      await hm("code");
      host.send(
        JSON.stringify({ type: "hello", name: "Proxy Integration Mac" }),
      );
      host.send(JSON.stringify({ type: "rotate" }));
      const code = (await hm("code")).code;
      const anonymous = await (await fetch(localOrigin + "/api/status")).json();
      assert.equal(anonymous.hostOnline, true);
      assert.equal(anonymous.name, "Your Mac");
      assert.equal(anonymous.paired, false);

      const post = (origin) =>
        fetch(localOrigin + "/api/pair", {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ code, name: "Proxy Test Quest" }),
        });
      assert.equal((await post("https://attacker.invalid")).status, 403);
      assert.equal((await post(localOrigin)).status, 403);
      let granted = false;
      const pairing = post(publicOrigin).then((response) => {
        granted = true;
        return response;
      });
      const approval = await hm("approval");
      await delay(50);
      assert.equal(
        granted,
        false,
        "pairing must wait for native host approval",
      );
      host.send(
        JSON.stringify({ type: "approval", id: approval.id, allow: true }),
      );
      const response = await pairing;
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie");
      assert.match(cookie, /(?:^|;\s*)Secure(?:;|$)/);
      assert.match(cookie, /(?:^|;\s*)HttpOnly(?:;|$)/);
      assert.match(cookie, /(?:^|;\s*)SameSite=Strict(?:;|$)/);
      const cookieHeader = cookie.split(";")[0];
      const paired = await (
        await fetch(localOrigin + "/api/status", {
          headers: { Cookie: cookieHeader },
        })
      ).json();
      assert.equal(paired.paired, true);
      assert.equal(paired.name, "Proxy Integration Mac");
      assert.equal(paired.device, "Proxy Test Quest");

      const client = new WebSocket(signalUrl, {
        headers: { Origin: publicOrigin, Cookie: cookieHeader },
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

      for (const headers of [
        { Origin: publicOrigin },
        { Origin: "https://attacker.invalid", Cookie: cookieHeader },
        { Origin: localOrigin, Cookie: cookieHeader },
      ]) {
        const unauthorized = new WebSocket(signalUrl, { headers });
        sockets.push(unauthorized);
        await assert.rejects(open(unauthorized), /401/);
      }
    } finally {
      for (const socket of sockets) socket.terminate();
      if (child.exitCode === null) {
        const exited = new Promise((resolve) => child.once("exit", resolve));
        child.kill();
        await exited;
      }
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
