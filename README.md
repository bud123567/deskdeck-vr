# DeskDeck VR

A native macOS desktop streamed into a Three.js/WebXR workspace. This is a working **phase-one implementation with selected workstation tools**, not a claim that the four-phase product is finished or production-certified.

[Open the live dashboard](https://jennifer-applications-ghz-occurs.trycloudflare.com). This temporary HTTPS deployment serves the real pairing API and WebSocket service from the development Mac. It stays online only while that Mac and its tunnel are running, and its URL changes on restart. Desktop access requires a pairing code and explicit Mac approval. Streaming currently requires the headset and Mac on a reachable local network. See [hosting and restart instructions](docs/HOSTING.md).

**Verified during local development:** ScreenCaptureKit → native libwebrtc → Chrome video, 1920 × 1242, direct peer, an observed 8 ms round-trip time on loopback. That figure is not Quest latency or motion-to-photon latency. Quest 2 testing, current H.264 capture/input verification and durable hosting remain release gates. See [the verification record](docs/VERIFICATION.md) and [the roadmap](ROADMAP.md).

You can also launch the local server and companion with `scripts/start-local.command` after dependencies are installed.

## Run the dashboard locally

Node 22+ and Xcode 15+ / macOS 14+ are required. Use the included lockfile.

```bash
git clone https://github.com/bud123567/deskdeck-vr.git
cd deskdeck-vr
npm ci
npm run dev
```

Open [DeskDeck on this Mac](http://localhost:3443). Development HTTP is **bound to loopback** and is not a headset deployment. The server creates a private `.data/host.json` configuration. Never share this file or the `.data` directory.

## Build and open the Mac companion

```bash
npm run host:build
open "artifacts/DeskDeck Host.app" --args --config "$PWD/.data/host.json"
```

The launch argument imports the local host credential into macOS Keychain. Subsequent launches remember it. Alternatively use **Import server config** in the app. The host shows a QR code for the website and a two-minute six-digit pairing code. Enable Screen Recording and Accessibility with its two permission buttons; relaunch if macOS requests it. No microphone or Input Monitoring permission is requested.

The bundled app is **ad-hoc signed for local development**. Distribution requires your Apple Developer ID, hardened-runtime testing, notarization and a stable signing identity. Rebuilding with a different signing identity can require granting permissions again. `scripts/build-host.sh` uses the installed Xcode without changing global `xcode-select` settings.

## Connect from Quest (trusted HTTPS required)

Quest WebXR requires a secure origin. Obtain a publicly trusted TLS certificate for a hostname you control, with that hostname resolving to this Mac's LAN address. A DNS-01 certificate flow can issue this without opening inbound internet ports. Supply the certificate's full chain and matching private key; both must be trusted by macOS and Quest. Do not bypass certificate warnings. A certificate for `localhost` or merely accepting a self-signed warning is not a usable Quest deployment.

```bash
npm run build
PUBLIC_ORIGIN=https://deskdeck.example.com:3443 \
TLS_CERT=/absolute/path/fullchain.pem \
TLS_KEY=/absolute/path/privkey.pem \
npm start
```

Replace the hostname and paths. Allow port 3443 on your local firewall only. Relaunch the host with the generated configuration to update its WSS URL. Keep the Mac awake, connect Quest to the same LAN, open the HTTPS website, pair with the code, approve the named headset **on the Mac**, then **Connect to Mac → Enter VR**. The browser remembers the device in an HttpOnly, Secure, SameSite=Strict cookie for up to 30 days. Remove devices from the host to revoke access immediately.

TLS/signaling is separate from media: the Node service never accepts desktop frames or input messages. Direct WebRTC carries SRTP video and a DTLS data channel. No STUN or TURN server is configured in this milestone. This intentionally targets reachable LAN peers, not NAT traversal or internet access. Wireless client isolation, a VPN, firewall rules or browser local-network permissions can prevent connectivity.

## Controls

| Input                          | Action                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------- |
| Controller ray + trigger       | Move pointer / left button; hold to drag                                          |
| Grip over desktop              | Right button                                                                      |
| Thumbstick over desktop        | Scroll                                                                            |
| Grip over handle below monitor | Move / rotate the monitor                                                         |
| Hold handle + thumbstick       | Resize                                                                            |
| X                              | Floating keyboard                                                                 |
| Y                              | Nearby quick menu                                                                 |
| A                              | Command–Tab                                                                       |
| B                              | Mission Control                                                                   |
| Bluetooth keyboard             | Focus desktop view to send keys; headset/browser-reserved keys cannot be captured |
| Dashboard sliders              | Accessible alternatives to monitor grab, distance, resize, rotation and curvature |

Quest owns its system/menu button, so the application uses Y. Optional WebXR hand input can provide a select/pinch ray when the browser exposes it; two-hand stretch and palm recognition are not implemented or claimed.

The dashboard has real connection state, app launching (allowlisted installed apps), Mac shortcuts, explicit text clipboard transfer, command search, six environment color/grid variations, focus mode, saved local geometry, and observed stream statistics. These are restrained variations of the same room, not six modeled worlds. Dock apps absent from the Mac will not launch. Mac shortcuts depend on the user's macOS shortcut assignments. Clipboard is requested manually; history is not silently collected. Screenshots invoke macOS's screenshot tool, not a fabricated gallery.

## Project map

- `host/Sources/DeskDeckHost`: SwiftUI menu-bar host, ScreenCaptureKit, RTC video source, input allowlist and Keychain credentials.
- `server`: TLS HTTP/WebSocket signaling, pairing, approval, rate limits and device revocation.
- `web/lib/session.ts`: browser WebRTC, stats, scoped signaling and recovery.
- `web/lib/workspace.ts`: actual 3D monitor, curved geometry, ray input, dock and VR keyboard.
- `web/app`: responsive React control interface.
- `tests`: protocol/security tests, browser flows and opt-in native smoke test.

H.264 is prioritized in negotiation, using WebRTC's Apple encoder path (VideoToolbox where available); actual codec is shown in Connection. Encoding hardware utilization must be measured on each supported Mac. Capture targets a 1920-pixel-wide display at up to 60 fps, preserving its actual aspect ratio. ScreenCaptureKit suppresses unchanged frames, so an idle desktop can report fewer fps. WebRTC provides congestion control; manual quality presets and 72/90 fps tuning are later work. Do not infer these from Quest's display refresh rate.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run format:check
# With the dev server running and Google Chrome installed:
node tests/browser.mjs
# Requires the host, granted permissions and explicit Mac approval:
PAIR_CODE=123456 node tests/native-smoke.mjs
```

No scripted macOS permission bypasses. The native smoke test only targets a local test browser and reports actual decoded frames. Security tests run a separate temporary API-only server and do not alter your paired devices. The [verification record](docs/VERIFICATION.md) states what was actually observed. Generated screenshots, browser profiles, credentials, and local verification output are excluded from source control. See [the security notes](docs/SECURITY.md) for threat boundaries.
