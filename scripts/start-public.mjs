import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  createWriteStream,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const port = Number(process.env.PORT || 3443);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer between 1 and 65535");
if (!existsSync("web/.next/BUILD_ID"))
  throw new Error("Run npm run build before starting the public server.");
// Refuse to publish a different process already listening on this port.
await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", () =>
    reject(
      new Error(
        `Port ${port} is in use. Stop the local DeskDeck server first.`,
      ),
    ),
  );
  probe.listen(port, "127.0.0.1", () => probe.close(resolve));
});
const dataDir = resolve(process.env.DATA_DIR || ".data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const urlPath = resolve(dataDir, "public-url.txt");
const pidPath = resolve(dataDir, "public-server.pid");
const log = createWriteStream(resolve(dataDir, "quick-tunnel.log"), {
  mode: 0o600,
});
let app;
let stopping = false;
let started = false;
let recent = "";
const tunnel = spawn(
  "cloudflared",
  ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`],
  { stdio: ["ignore", "pipe", "pipe"] },
);
writeFileSync(pidPath, String(process.pid), { mode: 0o600 });
const shutdown = (code) => {
  if (stopping) return;
  stopping = true;
  clearTimeout(timeout);
  app?.kill("SIGTERM");
  tunnel.kill("SIGTERM");
  for (const path of [urlPath, pidPath]) {
    try {
      unlinkSync(path);
    } catch {}
  }
  setTimeout(() => process.exit(code), 1000);
};
const timeout = setTimeout(() => {
  console.error("Tunnel startup timed out. See .data/quick-tunnel.log.");
  shutdown(1);
}, 60000);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => shutdown(0));
tunnel.once("error", () => {
  console.error(
    "cloudflared could not start. Install it first: https://developers.cloudflare.com/tunnel/downloads/",
  );
  shutdown(1);
});
tunnel.once("exit", (code) => {
  if (!stopping) {
    console.error(`HTTPS tunnel stopped (${code}).`);
    shutdown(1);
  }
});
async function startApp(origin) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    DATA_DIR: dataDir,
    PUBLIC_ORIGIN: origin,
    BIND: "127.0.0.1",
    TLS_TERMINATION: "loopback",
  };
  delete env.TLS_CERT;
  delete env.TLS_KEY;
  app = spawn(process.execPath, ["server/index.mjs"], {
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  app.once("error", () => shutdown(1));
  app.once("exit", () => {
    if (!stopping) {
      console.error("DeskDeck server stopped.");
      shutdown(1);
    }
  });
  for (let attempt = 0; attempt < 100 && !stopping; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        clearTimeout(timeout);
        writeFileSync(urlPath, origin + "\n", { mode: 0o600 });
        console.log(
          `\nPublic website: ${origin}\nTemporary link: keep this process and the Mac running. Restarting creates a new URL.\nImport .data/host.json in DeskDeck Host to update its QR code.\nDesktop streaming still requires reachable LAN peers and approval on your Mac.`,
        );
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!stopping) shutdown(1);
}
function receive(chunk) {
  log.write(chunk);
  recent = (recent + chunk.toString()).slice(-8192);
  const origin = recent.match(
    /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/,
  )?.[0];
  if (origin && !started && !stopping) {
    started = true;
    startApp(origin).catch((error) => {
      console.error(error.message);
      shutdown(1);
    });
  }
}
tunnel.stdout.on("data", receive);
tunnel.stderr.on("data", receive);
