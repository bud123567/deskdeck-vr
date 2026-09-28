# DeskDeck interaction contract

Authority: user's full brief, phased delivery. Initial milestone is one native Mac desktop over WebRTC with controller input. Host approval is mandatory; paired credentials expire in 30 days. No public internet or relay mode in this milestone.

| Capability      | Canonical owner             | Source of truth     | Allowed variants                | Verification          |
| --------------- | --------------------------- | ------------------- | ------------------------------- | --------------------- |
| Form            | page.tsx pairing form       | This contract       | inline owned errors, noValidate | browser tests         |
| Select/Listbox  | native select               | DESIGN.md           | OS popup accepted               | browser tests         |
| Scrollbar       | globals.css                 | DESIGN.md           | global baseline                 | strict audit          |
| Toast           | page.tsx notice/live region | This contract       | dismissible status              | browser tests         |
| Modal           | native dialog               | This contract       | pair and command palette        | keyboard test         |
| Connection      | lib/session.ts              | protocol and server | connect / retry / end           | signaling integration |
| Saved workspace | page.tsx save/restore       | This contract       | local browser only              | persistence test      |

No tables, dates, server CRUD lists, locale switch, payments or accounts in v0.1. Local command search is immediate, nonpersistent and has an explicit clear button. Input is never sent while a dialog has focus. Escape is reserved for closing the dialog. Pairing errors preserve code and focus the code field. A pending approval disables duplicate submits. Busy pairing remains cancellable by server timeout; it never silently approves. User can stop an active session on either end. Keyboard/button state releases on blur and disconnect.

Native removal of a trusted device requires confirmation and immediately closes its session. Unsupported features are documented in ROADMAP; don't add working-looking controls for them. Status is derived from actual signaling/data-channel/RTC stats, not timers. Reconnection retries for 30 seconds and retains local display arrangement. Local UI uses one shared stylesheet for all sections and one notice system. English is the supported locale; no Japan-market requirements.
