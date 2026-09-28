# Verification record

## Passed

- Native Swift release build and app-bundle packaging against pinned WebRTC 153.0.0.
- Next.js production build and TypeScript checks.
- Ten automated security/protocol tests: strong credentials, rate limits, bounded signaling, host approval, cookie flags, origin/auth rejection, scoped SDP relay, immediate revocation and production loopback TLS termination restrictions.
- Public HTTPS deployment: real Chrome desktop/mobile flows passed against the tunnel URL, with zero axe violations in the tested state and no uncaught browser errors. Public status responds without disclosing the Mac hostname; unpaired WebSockets and cross-origin pairing attempts are rejected. The native host reconnects locally. Production proxy integration separately verifies host approval, Secure cookies and authorized SDP relay using a disposable simulated host.
- Real Chrome desktop/mobile flows: pairing validation, native dialog Escape, save/reload layout, command search/clear/no-results, focus mode, environment selection and mobile navigation.
- Automated axe checks: zero WCAG 2 A/AA and 2.1 AA violations in the tested dashboard state. This is not a blanket accessibility certification.
- Strict premium UI audit and DESIGN.md lint: no errors or warnings.
- Live native Mac capture received in Chrome at 1920 × 1242 over direct WebRTC. The initial codec was VP8. Observed loopback RTT ranged from 1–8 ms across successful captures; this does not measure LAN/headset latency or motion-to-photon latency.

## Pending current-build live verification

Forcing H.264 in the original host connected without decoded frames. The final host now uses `RTCVideoEncoderFactoryH264` and native NV12 capture. It compiles, but macOS permission checks rejected the rebuilt ad-hoc-signed app even though the settings entries still showed enabled. The user was asked to refresh these existing permissions. The H.264 path must pass a live test before claiming hardware-encoded streaming works.

The input test did not yet produce the expected text in its disposable test target. It exposed a native-window focus issue in the test harness; there is no successful end-to-end input claim yet. The fixture and persistent test browser are included for continuing this test. No user clipboard values or screen images were saved as test evidence.

## Remaining device and distribution checks

The dashboard and signaling server now have a temporary publicly trusted HTTPS URL; a stable hostname and permanent hosting remain unconfigured. No actual Quest 2 session, controller ergonomics, sustained framerate, recovery after Wi-Fi loss, motion-to-photon latency or hand-tracking behavior has been verified. Public deployment checks do not establish current-build desktop streaming or input success. No production notarization/security audit has been performed. See ROADMAP.md for unimplemented phases.

The dashboard's WebXR render loop and input code are real. Its disconnected image explicitly identifies a workspace preview; it is not represented as a successful remote session.
