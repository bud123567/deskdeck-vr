# Hosting DeskDeck

The dashboard, pairing HTTP API and WebSocket signaling service run together in one Node process. A static GitHub Pages deployment cannot run this service. The native Mac companion and browser exchange desktop video/input directly over encrypted WebRTC; the HTTPS tunnel carries the dashboard and signaling only.

## Current live deployment

[Open DeskDeck](https://jennifer-applications-ghz-occurs.trycloudflare.com).

This is a temporary Cloudflare Quick Tunnel to a production build running on the development Mac. It needs that Mac awake, a working internet connection, and the server/tunnel processes running. The URL changes if the tunnel restarts. Cloudflare provides [no uptime guarantee for Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/). This is a development deployment, not permanent hosting.

Opening the URL does not grant desktop access. Pair using the current six-digit code in DeskDeck Host, then approve the named browser on the Mac. HTTPS makes the browser eligible for WebXR; actual Quest behavior still needs headset verification. The app has no STUN/TURN service, so desktop streaming still requires directly reachable peers, normally on the same LAN. A public dashboard URL does not add cross-network streaming.

## Start a fresh public link

Install Node 22+, dependencies (`npm ci`), and [cloudflared](https://developers.cloudflare.com/tunnel/downloads/). Stop any existing DeskDeck server on port 3443 first. Then run:

```bash
npm run share
```

Keep the terminal open. The launcher builds the app, obtains a temporary HTTPS hostname, and runs the Node server on loopback. It writes the URL to `.data/public-url.txt` and tunnel diagnostics to `.data/quick-tunnel.log`. Stop both server and tunnel with Control-C. For a background launch, its process ID is stored in `.data/public-server.pid`:

```bash
kill "$(cat .data/public-server.pid)"
```

Import the generated `.data/host.json` in DeskDeck Host to update its QR code. Alternatively quit the companion, then reopen it:

```bash
open "artifacts/DeskDeck Host.app" --args --config "$PWD/.data/host.json"
```

The native companion connects privately to `ws://127.0.0.1:3443/signal`; browser traffic uses the public HTTPS/WSS endpoint. Never publish `.data`, which includes the native host credential and paired-device records. Browser cookies are scoped to the temporary hostname; a new hostname requires browser pairing again. Old device entries can be removed in the host.

## Stable hostname

For a durable deployment, configure a named HTTPS tunnel or a trusted local reverse proxy with a stable hostname. Point it at `http://127.0.0.1:3443`, enable WebSocket upgrades and allow pairing responses to wait at least 60 seconds. Start the app using:

```bash
npm run build
PUBLIC_ORIGIN=https://deskdeck.example.com \
TLS_TERMINATION=loopback \
BIND=127.0.0.1 \
npm start
```

Replace the example hostname with the actual HTTPS origin, without a trailing slash. This mode rejects non-loopback bindings and always issues Secure cookies. It does not trust forwarded headers. Direct TLS certificates are also supported as described in the README. Stable hosting still needs an always-on machine and persistent private `.data` storage; this single-host service must not run as multiple unsynchronized instances.
