# Verification record

## Passed

- Native Swift release build and app-bundle packaging against pinned WebRTC 153.0.0.
- Next.js production build and TypeScript checks.
- Ten automated security/protocol tests: strong credentials, rate limits, bounded signaling, host approval, cookie flags, origin/auth rejection, scoped SDP relay, immediate revocation and production loopback TLS termination restrictions.
- Public HTTPS deployment: real Chrome desktop/mobile flows passed against the tunnel URL, with zero axe violations in the tested state and no uncaught browser errors. Public status responds without disclosing the Mac hostname; unpaired WebSockets and cross-origin pairing attempts are rejected. The native host reconnects locally. Production proxy integration separately verifies host approval, Secure cookies and authorized SDP relay using a disposable simulated host.
- Real Chrome desktop/mobile flows: pairing validation, native dialog Escape, save/reload layout, command search/clear/no-results, focus mode, environment selection and mobile navigation.
- Automated axe checks: zero WCAG 2 A/AA and 2.1 AA violations in the tested dashboard state. This is not a blanket accessibility certification.
- Strict premium UI audit and DESIGN.md lint: no errors or warnings.
- Current signed host, verified on September 27, 2026: the approved Chrome browser opened the public HTTPS dashboard and decoded live Mac capture at 1112 × 720 over direct WebRTC. The dashboard reported **Connected**, H.264, 30 fps, approximately 0.3 Mbps and 1 ms RTT; DeskDeck Host reported **Headset connected**. Follow-up checks remained connected at 29–30 fps, and ending the session returned the native host to **Ready to connect**. This was a local Chrome session, not a Quest session. Statistics are observed snapshots, not a sustained-performance benchmark, and the RTT is not motion-to-photon latency.
- Historical initial build: native Mac capture reached Chrome at 1920 × 1242 using VP8, with observed loopback RTT of 1–8 ms. The current H.264 build uses the smaller capture dimensions described below.

## H.264 fix and live result

The H.264 investigation identified two independent failures. macOS retained an older ad-hoc code requirement even while its permission switches showed enabled; removing and re-adding only DeskDeck Host restored both permissions. The encrypted peer connection then succeeded, but WebRTC logged VideoToolbox error `-12902`: 1920 × 1242 at 60 fps exceeded the bundled encoder's advertised H.264 level 3.1. Capture now fits within 1280 × 720 at 30 fps with even dimensions and preserved aspect ratio.

The updated local build uses an existing Apple Development identity to retain a consistent identity on subsequent builds. After refreshing permissions for this signed build, the live Chrome test passed with decoded H.264 frames at 1112 × 720. Browser stream statistics establish this result; encoding hardware utilization was not measured. Optional diagnostics report capture and encoding counters without recording screen images.

## Pending input verification

The input test did not yet produce the expected text in its disposable test target. It exposed a native-window focus issue in the test harness; there is no successful end-to-end input claim yet. The fixture and persistent test browser are included for continuing this test. No user clipboard values or screen images were saved as test evidence.

## Remaining device and distribution checks

The dashboard and signaling server now have a temporary publicly trusted HTTPS URL; a stable hostname and permanent hosting remain unconfigured. No actual Quest 2 session, controller ergonomics, sustained framerate, recovery after Wi-Fi loss, motion-to-photon latency or hand-tracking behavior has been verified. The successful local Chrome stream does not establish headset compatibility, end-to-end input success or hardware encoder utilization. No production notarization/security audit has been performed. See ROADMAP.md for unimplemented phases.

The dashboard's WebXR render loop and input code are real. Its disconnected image explicitly identifies a workspace preview; it is not represented as a successful remote session.
