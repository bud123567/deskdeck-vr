# Delivery status and next gates

The user explicitly prioritized a reliable first pipeline before the rest of the platform. This repository does not mark the entire requested platform complete.

## Phase 1 — implemented, headset acceptance pending

Native ScreenCaptureKit capture, native WebRTC, WebXR video texture, controller pointer/buttons/scroll, keyboard input, TLS server, expiring code + host approval, remembered device credentials, revocation and a 30-second recovery window. Native Mac-to-desktop-browser video is verified; Quest 2 LAN/HTTPS, sustained load and controller ergonomics are not.

Release gates: real Quest headset session, measured latency and frame pacing, network-loss recovery on hardware, input release on every disconnect, permission denial/regrant, native signing/notarization, multi-user/privacy review. Do not ship as production-ready until these are closed.

## Phase 2 — selected features implemented

Movable, resizable, rotatable, curved main monitor; dock launching; shortcuts; saved monitor geometry; manual placement alternatives; focus mode. Pending: multiple independent physical display tracks, virtual extended macOS displays, snapping/layout formations, per-widget spatial persistence and custom dock editing. Duplicating a video texture would not satisfy independent monitors.

## Phase 3 — selected features implemented

Explicit text clipboard transfers, observed WebRTC metrics, command palette and basic VR keyboard. Pending: scoped file browsing/downloads, file permission prompts, clipboard pins/history, custom shortcut editor, media metadata/system media controls, VR diagnostics panel, screenshot gallery and screenshot capture of both spaces, notes/calendar/calculator/Pomodoro widgets, keyboard modes and configurable controller mappings.

## Phase 4 — not implemented

Internet TURN infrastructure with short-lived credentials, accounts/multi-Mac, secure discovery experience, full environment assets, two-hand gestures/palm menu, virtual display driver, workspace app/window restoration, launch-at-login packaging validation and comprehensive remote threat review. Never expose remote mode until these exist and pass security tests.
