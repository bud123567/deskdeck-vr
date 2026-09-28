import next from "next";
import http from "node:http";
import https from "node:https";
import { WebSocketServer, WebSocket } from "ws";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  existsSync,
} from "node:fs";
import { resolve } from "node:path";
import { runtimeConfig } from "./runtime.mjs";
import {
  token,
  digest,
  equal,
  pairingCode,
  Limiter,
  validSignal,
} from "./security.mjs";
const dev = process.argv.includes("--dev");
const apiOnly = process.argv.includes("--api-only");
const { port, secure, secureBrowser, bind, origin, hostUrl } = runtimeConfig(
  process.env,
  { dev },
);
const dataDir = resolve(process.env.DATA_DIR || ".data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const configPath = resolve(dataDir, "host.json");
const config = existsSync(configPath)
  ? JSON.parse(readFileSync(configPath, "utf8"))
  : {
      secret: token(),
      url: origin.replace(/^http/, "ws") + "/signal",
      website: origin,
    };
config.url = hostUrl;
config.website = origin;
writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
const devicesPath = resolve(dataDir, "devices.json");
let devices = existsSync(devicesPath)
  ? JSON.parse(readFileSync(devicesPath, "utf8"))
  : [];
const persist = () => {
  writeFileSync(devicesPath + ".tmp", JSON.stringify(devices), { mode: 0o600 });
  renameSync(devicesPath + ".tmp", devicesPath);
};
const app = apiOnly ? null : next({ dev, dir: resolve("web") });
if (app) await app.prepare();
const handle = app
  ? app.getRequestHandler()
  : (_req, res) => {
      res.writeHead(404);
      res.end();
    };
const limiter = new Limiter();
let host = null,
  hostName = "Your Mac",
  code = "",
  codeExpires = 0,
  active = null,
  pending = null;
const send = (ws, m) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
};
const auth = (req) => {
  const raw = /(?:^|;\s*)deskdeck=([\w-]+)/.exec(req.headers.cookie || "")?.[1];
  return (
    raw &&
    devices.find((d) => equal(d.hash, digest(raw)) && d.expires > Date.now())
  );
};
const json = (res, status, body) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
};
const rotate = () => {
  code = pairingCode();
  codeExpires = Date.now() + 120000;
  send(host, {
    type: "code",
    code,
    expires: codeExpires,
    devices: devices.map(({ id, name, lastSeen }) => ({ id, name, lastSeen })),
  });
};
const endSession = (interrupted = false) => {
  if (active) {
    send(active.ws, { type: interrupted ? "interrupted" : "ended" });
    send(host, { type: "stop", session: active.id });
    active.ws.close();
    active = null;
  }
};
const rejectPending = (reason) => {
  if (pending) {
    clearTimeout(pending.timer);
    json(pending.res, 403, { error: reason });
    pending = null;
  }
};
async function body(req) {
  let s = "";
  for await (const chunk of req) {
    s += chunk;
    if (s.length > 4096) throw Error("Request too large");
  }
  return JSON.parse(s);
}
const listener = async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), xr-spatial-tracking=(self)",
  );
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  );
  if (secureBrowser)
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  try {
    const path = new URL(req.url, origin).pathname;
    if (path === "/api/status" && req.method === "GET") {
      const d = auth(req);
      return json(res, 200, {
        hostOnline: Boolean(host),
        name: d ? hostName : "Your Mac",
        paired: Boolean(d),
        device: d?.name,
        expires: d?.expires,
      });
    }
    if (path === "/api/pair" && req.method === "POST") {
      if (req.headers.origin !== origin)
        return json(res, 403, { error: "Untrusted origin" });
      if (
        !limiter.allow(req.socket.remoteAddress) ||
        !limiter.allow("global", 15)
      )
        return json(res, 429, { error: "Too many attempts. Wait one minute." });
      const b = await body(req);
      if (!host || !equal(b.code, code) || Date.now() > codeExpires)
        return json(res, 403, {
          error: "Code expired or incorrect. Check DeskDeck Host.",
        });
      if (pending)
        return json(res, 409, {
          error: "A pairing request is already awaiting approval on your Mac.",
        });
      const id = token();
      const name = String(b.name || "Quest Browser").slice(0, 64);
      pending = {
        id,
        name,
        res,
        timer: setTimeout(
          () => rejectPending("Approval timed out. Try again."),
          60000,
        ),
      };
      send(host, { type: "approval", id, name });
      code = "";
      req.on("close", () => {
        /* Response remains open while awaiting explicit host approval. */
      });
      return;
    }
    if (path === "/api/disconnect" && req.method === "POST") {
      if (req.headers.origin !== origin || !auth(req))
        return json(res, 403, { error: "Not authorized" });
      if (active?.deviceId === auth(req).id) endSession();
      return json(res, 200, { ok: true });
    }
    if (path.startsWith("/api/")) return json(res, 404, { error: "Not found" });
    return handle(req, res);
  } catch {
    if (!res.headersSent) json(res, 400, { error: "Invalid request" });
  }
};
const server = secure
  ? https.createServer(
      {
        cert: readFileSync(process.env.TLS_CERT),
        key: readFileSync(process.env.TLS_KEY),
      },
      listener,
    )
  : http.createServer(listener);
const wss = new WebSocketServer({ noServer: true, maxPayload: 131072 });
server.on("upgrade", (req, socket, head) => {
  if (new URL(req.url, origin).pathname !== "/signal") {
    if (dev && new URL(req.url, origin).pathname.startsWith("/_next/")) {
      app?.getUpgradeHandler()(req, socket, head);
      return;
    }
    socket.destroy();
    return;
  }
  const isHost = equal(req.headers.authorization, `Bearer ${config.secret}`);
  const d = auth(req);
  if (!isHost && (req.headers.origin !== origin || !d)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.isHost = isHost;
    ws.device = d;
    ws.alive = true;
    wss.emit("connection", ws, req);
  });
});
wss.on("connection", (ws) => {
  if (ws.isHost) {
    if (host) {
      ws.close(1008, "Host already connected");
      return;
    }
    host = ws;
    rotate();
  } else send(ws, { type: "ready", hostOnline: Boolean(host) });
  ws.on("pong", () => (ws.alive = true));
  ws.on("message", (raw) => {
    try {
      const m = JSON.parse(raw);
      if (ws.isHost && ws !== host) return;
      if (
        !ws.isHost &&
        (!devices.some(
          (d) => d.id === ws.device.id && d.expires > Date.now(),
        ) ||
          !limiter.allow("ws:" + ws.device.id, 300))
      ) {
        ws.close(1008);
        return;
      }
      if (ws === host) {
        if (m.type === "hello") {
          hostName = String(m.name || "Mac").slice(0, 80);
          return;
        }
        if (m.type === "rotate") {
          rejectPending("Pairing code was renewed.");
          rotate();
          return;
        }
        if (m.type === "approval" && pending && equal(m.id, pending.id)) {
          if (!m.allow) {
            rejectPending("Pairing declined on your Mac.");
            rotate();
            return;
          }
          const credential = token();
          const id = token();
          const expires = Date.now() + 30 * 86400000;
          devices.push({
            id,
            name: pending.name,
            hash: digest(credential),
            expires,
            lastSeen: Date.now(),
          });
          persist();
          pending.res.setHeader(
            "Set-Cookie",
            `deskdeck=${credential}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secureBrowser ? "; Secure" : ""}`,
          );
          clearTimeout(pending.timer);
          json(pending.res, 200, { ok: true });
          pending = null;
          rotate();
          return;
        }
        if (m.type === "revoke") {
          devices = devices.filter((d) => d.id !== m.id);
          persist();
          if (active?.deviceId === m.id) endSession();
          for (const c of wss.clients) if (c.device?.id === m.id) c.close(1008);
          rotate();
          return;
        }
        if (m.type === "disconnect") {
          endSession();
          return;
        }
        if (
          active &&
          m.session === active.id &&
          (validSignal(m) || m.type === "error")
        )
          send(active.ws, m);
      } else {
        if (m.type === "connect") {
          if (!host)
            return send(ws, {
              type: "error",
              message: "Open DeskDeck Host on your Mac.",
              retryable: true,
            });
          if (active && active.ws !== ws)
            return send(ws, {
              type: "error",
              message:
                "Another device is connected. Disconnect it on the Mac first.",
            });
          if (active) endSession();
          const id = token();
          active = { id, ws, deviceId: ws.device.id };
          ws.device.lastSeen = Date.now();
          persist();
          send(ws, { type: "session", session: id });
          send(host, { type: "start", session: id, name: ws.device.name });
          return;
        }
        if (active?.ws === ws && m.session === active.id && validSignal(m))
          send(host, m);
      }
    } catch {
      ws.close(1008, "Invalid message");
    }
  });
  ws.on("close", () => {
    if (ws === host) {
      host = null;
      rejectPending("Mac disconnected.");
      endSession(true);
    } else if (active?.ws === ws) endSession();
  });
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
  if (host && Date.now() > codeExpires && !pending) rotate();
  if (
    active &&
    !devices.some((d) => d.id === active.deviceId && d.expires > Date.now())
  )
    endSession();
}, 15000).unref();
server.listen(port, bind, () =>
  console.log(`DeskDeck ready at ${origin}\nHost config: ${configPath}`),
);
