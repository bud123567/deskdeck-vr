"use client";
import { useEffect, useRef, useState } from "react";
import {
  Monitor,
  PanelLeft,
  Command,
  SlidersHorizontal,
  ArrowUpRight,
  Plus,
  Check,
  X,
  Headset,
  Keyboard,
  ShieldCheck,
  Wifi,
  ArrowRight,
  Maximize,
  RotateCcw,
  Focus,
  Link2,
  Clipboard,
  Terminal,
  Globe,
  Music2,
  Folder,
  Power,
  Save,
  Search,
  ChevronDown,
  HelpCircle,
} from "lucide-react";
import { DesktopSession, type Stats, type Input } from "../lib/session";
import { Workspace, defaultLayout, type Layout } from "../lib/workspace";
type Host = {
  hostOnline: boolean;
  name: string;
  paired: boolean;
  device?: string;
};
const environments = [
  "Dark Studio",
  "Space Station",
  "Cyber Loft",
  "Mountain Office",
  "Void",
  "Minimal Black Room",
];
const shortcuts = [
  ["switch", "Switch apps", "⌘ ⇥"],
  ["spotlight", "Spotlight", "⌘ Space"],
  ["mission", "Mission Control", "⌃ ↑"],
  ["desktop", "Show desktop", "F11"],
  ["copy", "Copy", "⌘ C"],
  ["paste", "Paste", "⌘ V"],
  ["undo", "Undo", "⌘ Z"],
  ["screenshot", "Screenshot", "⌘ ⇧ 4"],
] as const;
const apps = [
  ["finder", "Finder", Folder],
  ["safari", "Safari", Globe],
  ["terminal", "Terminal", Terminal],
  ["vscode", "VS Code", Command],
  ["spotify", "Spotify", Music2],
] as const;
export default function Home() {
  const [host, setHost] = useState<Host>({
    hostOnline: false,
    name: "Your Mac",
    paired: false,
  });
  const [status, setStatus] = useState("Not connected");
  const [stats, setStats] = useState<Stats>({});
  const [tab, setTab] = useState("Workspace");
  const [layout, setLayout] = useState<Layout>(defaultLayout);
  const [saved, setSaved] = useState<Record<string, Layout>>({});
  const [workspaceName, setWorkspaceName] = useState("My workspace");
  const [pairOpen, setPairOpen] = useState(false);
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("My Quest 2");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState("");
  const [notice, setNotice] = useState("");
  const [xr, setXR] = useState(false);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [clipboard, setClipboard] = useState("");
  const [preview, setPreview] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    world = useRef<Workspace | undefined>(undefined),
    session = useRef<DesktopSession | undefined>(undefined),
    dialog = useRef<HTMLDialogElement>(null),
    commandDialog = useRef<HTMLDialogElement>(null),
    pairAbort = useRef<AbortController | undefined>(undefined);
  const connected = status === "Connected";
  const send = (m: Input) => session.current?.send(m);
  const inform = (text: string) => setNotice(text);
  const loadHost = async () => {
    try {
      const r = await fetch("/api/status");
      if (r.ok) setHost(await r.json());
    } catch {
      setHost((h) => ({ ...h, hostOnline: false }));
    }
  };
  useEffect(() => {
    void loadHost();
    const timer = setInterval(() => void loadHost(), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!canvas.current || !video.current) return;
    try {
      world.current = new Workspace(
        canvas.current,
        video.current,
        (m) => session.current?.send(m),
        setLayout,
      );
    } catch {
      setNotice(
        "WebGL is unavailable. Use the desktop view or enable graphics acceleration.",
      );
    }
    try {
      const s = JSON.parse(localStorage.getItem("deskdeck.layouts") || "{}");
      if (s && typeof s === "object") {
        const valid = Object.fromEntries(
          Object.entries(s).filter(([, v]) => {
            const l = v as Layout;
            return (
              l &&
              typeof l === "object" &&
              [l.width, l.distance, l.curve, l.height, l.yaw].every(
                Number.isFinite,
              ) &&
              l.width >= 1 &&
              l.width <= 6 &&
              l.distance >= 0.6 &&
              l.distance <= 5 &&
              l.height >= 0.6 &&
              l.height <= 3 &&
              l.curve >= 0 &&
              l.curve <= 1 &&
              Math.abs(l.yaw) <= 1 &&
              (l.x === undefined ||
                (Number.isFinite(l.x) && Math.abs(l.x) <= 5)) &&
              (l.pitch === undefined ||
                (Number.isFinite(l.pitch) && Math.abs(l.pitch) <= 1.5)) &&
              environments.includes(l.environment)
            );
          }),
        );
        setSaved(valid as Record<string, Layout>);
      }
    } catch {
      /* corrupt layouts are discarded */
    }
    void navigator.xr
      ?.isSessionSupported("immersive-vr")
      .then(setXR)
      .catch(() => setXR(false));
    return () => {
      pairAbort.current?.abort();
      session.current?.stop();
      world.current?.dispose();
    };
  }, []);
  useEffect(() => {
    world.current?.update(layout);
  }, [layout]);
  useEffect(() => {
    if (pairOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [pairOpen]);
  useEffect(() => {
    if (palette) commandDialog.current?.showModal();
    else commandDialog.current?.close();
  }, [palette]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "k" &&
        !e.isComposing
      ) {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (!connected) return;
    const release = () => send({ type: "release" });
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, [connected]);
  const patch = (v: Partial<Layout>) => setLayout((l) => ({ ...l, ...v }));
  async function pair(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setPairError("Enter the six-digit code shown on your Mac.");
      dialog.current?.querySelector<HTMLInputElement>(".pair-code")?.focus();
      return;
    }
    setPairing(true);
    setPairError("");
    pairAbort.current = new AbortController();
    try {
      const r = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name: deviceName }),
        signal: pairAbort.current.signal,
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      await loadHost();
      setPairOpen(false);
      setCode("");
      inform("Mac paired. You can now connect.");
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setPairError((e as Error).message);
    } finally {
      setPairing(false);
    }
  }
  function connect() {
    if (!host.paired) {
      setPairOpen(true);
      return;
    }
    if (!video.current) return;
    session.current?.stop();
    const s = new DesktopSession(video.current, setStatus, setStats, (m) => {
      if (m.type === "clipboard") setClipboard(String(m.text));
    });
    session.current = s;
    s.connect();
    setPreview(false);
  }
  function disconnect() {
    session.current?.stop();
    setStats({});
    setPreview(true);
  }
  async function enterVR() {
    try {
      await world.current?.enter();
    } catch (e) {
      inform((e as Error).message);
    }
  }
  function save() {
    const name = workspaceName.trim().slice(0, 40);
    if (!name) {
      inform("Name your workspace first.");
      return;
    }
    const next = { ...saved, [name]: layout };
    setSaved(next);
    try {
      localStorage.setItem("deskdeck.layouts", JSON.stringify(next));
      inform(`Saved “${name}”.`);
    } catch {
      inform(
        "Browser storage is unavailable. Layout is saved for this session only.",
      );
    }
  }
  const actions = [
    ...apps.map(([id, name]) => ({
      name: `Open ${name}`,
      run: () => send({ type: "launch", id }),
      remote: true,
    })),
    ...shortcuts.map(([id, name]) => ({
      name,
      run: () => send({ type: "shortcut", id }),
      remote: true,
    })),
    {
      name: "Toggle focus mode",
      run: () => patch({ focus: !layout.focus }),
      remote: false,
    },
    {
      name: "Reset monitor",
      run: () => setLayout(defaultLayout),
      remote: false,
    },
    { name: "Disconnect", run: disconnect, remote: true },
  ].filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));
  function pointer(e: React.PointerEvent<HTMLVideoElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ar =
      (video.current?.videoWidth || 16) / (video.current?.videoHeight || 10);
    const w = Math.min(rect.width, rect.height * ar),
      h = w / ar;
    send({
      type: "pointer",
      x: Math.max(
        0,
        Math.min(1, (e.clientX - rect.left - (rect.width - w) / 2) / w),
      ),
      y: Math.max(
        0,
        Math.min(1, (e.clientY - rect.top - (rect.height - h) / 2) / h),
      ),
    });
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="DeskDeck home">
          <span className="brand-icon">
            <PanelLeft size={24} />
          </span>
          <span>
            deskdeck<span className="vr-tag">VR</span>
          </span>
        </a>
        <div className="section-label">YOUR SPACE</div>
        <nav>
          {[
            [Monitor, "Workspace"],
            [SlidersHorizontal, "Displays"],
            [Command, "Shortcuts"],
            [Clipboard, "Clipboard"],
            [ShieldCheck, "Connection"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Monitor;
            return (
              <button
                key={String(label)}
                aria-label={String(label)}
                className={`nav-item ${tab === label ? "selected" : ""}`}
                onClick={() => setTab(String(label))}
              >
                <I size={18} />
                {String(label)}
                {tab === label && <span className="nav-dot" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-section">
          <div className="section-label">
            SAVED WORKSPACES{" "}
            <button
              title="Save current workspace"
              aria-label="Save current workspace"
              onClick={() => setTab("Displays")}
            >
              <Plus size={15} />
            </button>
          </div>
          {Object.keys(saved).length ? (
            Object.entries(saved).map(([name, l]) => (
              <button
                className="saved-item"
                key={name}
                onClick={() => {
                  if (
                    typeof l.width === "number" &&
                    typeof l.distance === "number"
                  ) {
                    setLayout({ ...defaultLayout, ...l });
                    inform(`Restored “${name}”.`);
                  }
                }}
              >
                <span className="tiny-grid">⊞</span>
                {name}
              </button>
            ))
          ) : (
            <p className="quiet-note">
              Set up your displays, then save a space to return to.
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="host-mini">
            <span className="mini-monitor">
              <Monitor size={20} />
            </span>
            <div>
              <strong>{host.name}</strong>
              <span>{host.hostOnline ? "Host online" : "Host offline"}</span>
            </div>
            <i className={host.hostOnline ? "dot online" : "dot"} />
          </div>
          <button className="help-link" onClick={() => setShowHelp((v) => !v)}>
            <HelpCircle size={16} /> Setup & controller guide{" "}
            <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          {connected && (
            <button className="end-session" onClick={disconnect}>
              <Power size={14} />
              End session
            </button>
          )}
          <div className="breadcrumb">
            Your space <span>/</span> <strong>{tab}</strong>
          </div>
          <button className="command-button" onClick={() => setPalette(true)}>
            <Search size={15} />
            <span>Find an action</span>
            <kbd>⌘ K</kbd>
          </button>
        </header>
        <nav className="mobile-nav" aria-label="Workspace sections">
          {[
            "Workspace",
            "Displays",
            "Shortcuts",
            "Clipboard",
            "Connection",
          ].map((name) => (
            <button
              key={name}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </nav>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">A LITTLE SPACE TO THINK.</div>
              <h1>
                {tab === "Workspace" ? "Your desk. Without the desk." : tab}
              </h1>
              <p>
                {tab === "Workspace"
                  ? "A familiar Mac. A whole new perspective."
                  : tab === "Displays"
                    ? "Make room for the way you work."
                    : tab === "Shortcuts"
                      ? "The keys you reach for, within reach."
                      : tab === "Clipboard"
                        ? "Move text between your Mac and your headset."
                        : "A private connection to your Mac."}
              </p>
            </div>
            <button
              className="primary"
              onClick={connected ? enterVR : connect}
              disabled={connected && !xr}
            >
              <Headset size={18} />
              {connected
                ? xr
                  ? "Enter VR"
                  : "Quest browser required"
                : host.paired
                  ? "Connect to Mac"
                  : "Connect your Mac"}
              <ArrowUpRight size={16} />
            </button>
          </div>
          {showHelp && (
            <section className="guide">
              <div>
                <h2>Four steps to your new workspace</h2>
                <p>
                  1. Run the DeskDeck server over trusted HTTPS. 2. Open
                  DeskDeck Host and import its server config. 3. Allow Screen
                  Recording and Accessibility, then pair here. 4. Connect and
                  enter VR on Quest.
                </p>
                <p>
                  <b>Controllers:</b> trigger clicks · grip right-clicks · grip
                  the monitor handle to move · hold handle + thumbstick to
                  resize · thumbstick scrolls · X keyboard · Y menu · A app
                  switcher · B Mission Control. The system menu button belongs
                  to Quest.
                </p>
              </div>
              <button
                aria-label="Close guide"
                onClick={() => setShowHelp(false)}
              >
                <X size={18} />
              </button>
            </section>
          )}
          <div
            className={`workspace-grid ${tab !== "Workspace" ? "secondary-tab" : ""}`}
          >
            <section className="stage-panel">
              <div className="panel-heading">
                <div>
                  <span className={`dot ${connected ? "online" : ""}`} />
                  <strong>{connected ? host.name : "Workspace preview"}</strong>
                  <span className="subtle-label">
                    {connected
                      ? stats.route || "Connecting peer"
                      : "NOT STREAMING"}
                  </span>
                </div>
                <button
                  className={layout.focus ? "active" : ""}
                  onClick={() => patch({ focus: !layout.focus })}
                >
                  <Focus size={15} />
                  {layout.focus ? "Exit focus" : "Focus mode"}
                </button>
              </div>
              <div className={`stage ${layout.focus ? "focused" : ""}`}>
                <div ref={canvas} className="world" />
                <div className="stage-corner">
                  <span className="corner-bracket" />
                  <span>
                    {layout.environment}
                    <small>
                      {preview
                        ? "Arrange your space before connecting"
                        : "Live spatial display"}
                    </small>
                  </span>
                </div>
                <div className="view-toggle">
                  <button
                    className={preview ? "active" : ""}
                    onClick={() => setPreview(true)}
                  >
                    Spatial
                  </button>
                  <button
                    className={!preview ? "active" : ""}
                    onClick={() => setPreview(false)}
                  >
                    Desktop
                  </button>
                </div>
                <video
                  ref={video}
                  className={`desktop-video ${preview ? "offstage" : ""}`}
                  autoPlay
                  playsInline
                  muted
                  tabIndex={connected ? 0 : -1}
                  aria-label="Remote Mac desktop. Focus to send keyboard input."
                  onPointerMove={pointer}
                  onPointerDown={(e) => {
                    if (!connected) return;
                    e.currentTarget.focus();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    pointer(e);
                    send({ type: "button", button: e.button, down: true });
                  }}
                  onPointerUp={(e) =>
                    send({ type: "button", button: e.button, down: false })
                  }
                  onPointerCancel={() => send({ type: "release" })}
                  onContextMenu={(e) => e.preventDefault()}
                  onWheel={(e) => {
                    if (connected) send({ type: "scroll", y: e.deltaY });
                  }}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    send({
                      type: "key",
                      code: e.code,
                      down: true,
                      meta: e.metaKey,
                      ctrl: e.ctrlKey,
                      alt: e.altKey,
                      shift: e.shiftKey,
                    });
                  }}
                  onKeyUp={(e) => {
                    e.preventDefault();
                    send({
                      type: "key",
                      code: e.code,
                      down: false,
                      meta: e.metaKey,
                      ctrl: e.ctrlKey,
                      alt: e.altKey,
                      shift: e.shiftKey,
                    });
                  }}
                  onBlur={() => send({ type: "release" })}
                />
                {!preview && !connected && (
                  <div className="no-stream">
                    <Monitor size={34} />
                    <h2>Your desktop will appear here</h2>
                    <p>Connect to your Mac to start a private stream.</p>
                    <button onClick={connect}>
                      Connect to Mac <ArrowRight size={15} />
                    </button>
                  </div>
                )}
                <div className="stage-bottom">
                  <span>
                    <span className="keycap">Y</span> Control center
                  </span>
                  <span>
                    <span className="keycap">X</span> Keyboard
                  </span>
                  <button
                    onClick={() => {
                      setLayout(defaultLayout);
                      inform("Monitor position reset.");
                    }}
                  >
                    <RotateCcw size={14} />
                    Recenter
                  </button>
                </div>
              </div>
              <div className="stream-bar">
                <span className="status-line">
                  <span className={`dot ${connected ? "online" : ""}`} />
                  {status}
                </span>
                <span>
                  {stats.width
                    ? `${stats.width} × ${stats.height}`
                    : "— resolution"}
                </span>
                <span>
                  {stats.fps ? `${Math.round(stats.fps)} FPS` : "— FPS"}
                </span>
                <span>
                  {stats.rtt !== undefined
                    ? `${Math.round(stats.rtt)} ms RTT`
                    : "— latency"}
                </span>
                <Wifi size={15} />
              </div>
            </section>
            <aside className="inspector">
              <section className="panel connection-panel">
                <div className="section-label">
                  YOUR COMPUTER <Link2 size={15} />
                </div>
                <div className="computer-icon">
                  <Monitor size={34} strokeWidth={1.2} />
                </div>
                <h2>{host.name}</h2>
                <p>
                  <span className={`dot ${host.hostOnline ? "online" : ""}`} />
                  {host.hostOnline
                    ? "Ready on your server"
                    : "Waiting for DeskDeck Host"}
                </p>
                <div className="connection-facts">
                  <span>
                    <ShieldCheck size={14} />
                    {host.paired ? "Trusted device" : "Approval required"}
                  </span>
                  <span>
                    <Wifi size={14} />
                    {connected ? stats.route || "Negotiating" : "Direct stream"}
                  </span>
                </div>
                <button
                  className={connected ? "danger outline" : "outline"}
                  onClick={connected ? disconnect : () => setPairOpen(true)}
                >
                  {connected ? <Power size={15} /> : <Plus size={15} />}{" "}
                  {connected
                    ? "Disconnect"
                    : host.paired
                      ? "Pair another browser"
                      : "Pair a computer"}
                </button>
              </section>
              <section className="panel environment-panel">
                <div className="section-label">
                  ENVIRONMENT{" "}
                  <span>
                    {String(
                      environments.indexOf(layout.environment) + 1,
                    ).padStart(2, "0")}{" "}
                    / 06
                  </span>
                </div>
                <div
                  className={`room-swatch env-${environments.indexOf(layout.environment)}`}
                >
                  <div className="room-lines" />
                  <span className="room-monitor" />
                </div>
                <label className="select-wrap">
                  <span className="sr-only">Environment</span>
                  <select
                    value={layout.environment}
                    onChange={(e) => patch({ environment: e.target.value })}
                  >
                    {environments.map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <p>Subtle surroundings. More room for focus.</p>
              </section>
            </aside>
          </div>
          {tab === "Workspace" && (
            <>
              <div className="lower-grid">
                <section className="panel dock-panel">
                  <div className="section-label">
                    YOUR MAC, ONE TAP AWAY <span>APP DOCK</span>
                  </div>
                  <div className="app-dock">
                    {apps.map(([id, name, Icon]) => (
                      <button
                        key={id}
                        disabled={!connected}
                        onClick={() => send({ type: "launch", id })}
                        title={
                          connected ? `Open ${name}` : "Connect to launch apps"
                        }
                      >
                        <span className={`app-icon ${id}`}>
                          <Icon size={23} />
                        </span>
                        <span>{name}</span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel quick-panel">
                  <div className="section-label">
                    MAKE IT YOURS <Maximize size={15} />
                  </div>
                  <h2>A monitor with no edges.</h2>
                  <p>Move closer. Go wider. Find your focus.</p>
                  <button
                    className="text-button"
                    onClick={() => setTab("Displays")}
                  >
                    Arrange your display <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              <div className="bottom-note">
                <ShieldCheck size={14} />
                <span>
                  Your screen travels directly between devices. Your space stays
                  yours.
                </span>
                <span className="version">LOCAL-FIRST · v0.1</span>
              </div>
            </>
          )}
          {tab === "Displays" && (
            <section className="panel tools-panel">
              <div className="tools-heading">
                <h2>Display arrangement</h2>
                <button onClick={() => setLayout(defaultLayout)}>
                  <RotateCcw size={15} />
                  Reset
                </button>
              </div>
              <div className="settings-grid">
                {(
                  [
                    ["Width", "width", 1, 6, 0.1, "m"],
                    ["Horizontal", "x", -5, 5, 0.1, "m"],
                    ["Tilt", "pitch", -1.5, 1.5, 0.05, "rad"],
                    ["Distance", "distance", 0.6, 5, 0.1, "m"],
                    ["Height", "height", 0.6, 3, 0.05, "m"],
                    ["Curve", "curve", 0, 1, 0.01, ""],
                    ["Rotation", "yaw", -1, 1, 0.05, "rad"],
                  ] as const
                ).map(([name, key, min, max, step, unit]) => (
                  <label className="range-field" key={key}>
                    <span>
                      {name}
                      <output>
                        {layout[key].toFixed(2)} {unit}
                      </output>
                    </span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step={step}
                      value={layout[key]}
                      onChange={(e) => patch({ [key]: Number(e.target.value) })}
                    />
                  </label>
                ))}
              </div>
              <div className="presets">
                {[
                  ["Laptop", 1.3],
                  ["27-inch", 2.2],
                  ["32-inch", 2.8],
                  ["Cinema", 4],
                  ["Wall", 6],
                ].map(([name, width]) => (
                  <button
                    key={name}
                    onClick={() => patch({ width: Number(width) })}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="save-row">
                <label>
                  Workspace name
                  <input
                    value={workspaceName}
                    maxLength={40}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                  />
                </label>
                <button className="primary" onClick={save}>
                  <Save size={16} />
                  Save workspace
                </button>
              </div>
              <p className="muted">
                One captured Mac display in this milestone. Virtual extended
                displays and independent multi-monitor streams are planned.
              </p>
            </section>
          )}
          {tab === "Shortcuts" && (
            <section className="panel tools-panel">
              <div className="tools-heading">
                <h2>Mac shortcuts</h2>
                <span className="muted">
                  {connected ? "Ready" : "Connect to use shortcuts"}
                </span>
              </div>
              <div className="shortcut-grid">
                {shortcuts.map(([id, name, keys]) => (
                  <button
                    disabled={!connected}
                    key={id}
                    onClick={() => send({ type: "shortcut", id })}
                  >
                    <span>{name}</span>
                    <kbd>{keys}</kbd>
                  </button>
                ))}
              </div>
              <p className="muted">
                Bluetooth keyboard input is sent when the desktop view has
                focus. Quest and browser-reserved shortcuts remain with the
                headset.
              </p>
            </section>
          )}
          {tab === "Clipboard" && (
            <section className="panel tools-panel">
              <div className="tools-heading">
                <h2>Clipboard</h2>
                <button
                  disabled={!connected}
                  onClick={() => send({ type: "clipboardRead" })}
                >
                  <Clipboard size={16} />
                  Read from Mac
                </button>
              </div>
              <label className="clipboard-field">
                Clipboard text
                <textarea
                  className="resize-none"
                  style={{ resize: "none" }}
                  value={clipboard}
                  maxLength={4096}
                  onChange={(e) => setClipboard(e.target.value)}
                  placeholder="Read your Mac clipboard, or enter text to send."
                />
              </label>
              <div className="presets">
                <button
                  disabled={!connected}
                  onClick={() => {
                    send({ type: "clipboardWrite", text: clipboard });
                    inform("Clipboard update sent to Mac.");
                  }}
                >
                  Send to Mac clipboard
                </button>
                <button
                  disabled={!connected || !clipboard}
                  onClick={() =>
                    send({ type: "text", text: clipboard.slice(0, 2048) })
                  }
                >
                  Type on Mac
                </button>
                <button onClick={() => setClipboard("")}>Clear</button>
              </div>
              <p className="muted">
                Text transfers only when you request it. Clipboard history is
                not stored.
              </p>
            </section>
          )}
          {tab === "Connection" && (
            <section className="panel tools-panel">
              <h2>Connection details</h2>
              <dl className="diagnostics">
                {[
                  ["Host", host.hostOnline ? "Online" : "Offline"],
                  ["Device", host.device || "Not paired"],
                  ["Stream", status],
                  [
                    "Transport",
                    connected ? "WebRTC · DTLS / SRTP" : "Not streaming",
                  ],
                  ["Route", stats.route || "—"],
                  ["Codec", stats.codec || "—"],
                  [
                    "Video bitrate",
                    stats.bitrate !== undefined
                      ? `${stats.bitrate.toFixed(1)} Mbps`
                      : "—",
                  ],
                  [
                    "Round-trip time",
                    stats.rtt !== undefined
                      ? `${Math.round(stats.rtt)} ms`
                      : "—",
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="muted">
                Manage or remove trusted headsets in DeskDeck Host on your Mac.
                Pairing lasts up to 30 days. This build supports direct
                connections on the same network; internet relay support is a
                later phase.
              </p>
            </section>
          )}
        </div>
      </main>
      <div className="toast" role="status" aria-live="polite">
        {notice && (
          <>
            <Check size={16} />
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </>
        )}
      </div>
      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (pairing) e.preventDefault();
          else setPairOpen(false);
        }}
        onClose={() => setPairOpen(false)}
        aria-labelledby="pair-title"
      >
        <form noValidate onSubmit={pair}>
          <div className="modal-head">
            <span className="brand-icon">
              <Link2 size={24} />
            </span>
            <button
              type="button"
              aria-label="Close pairing"
              disabled={pairing}
              onClick={() => setPairOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="eyebrow">YOUR MAC. YOUR SPACE.</div>
          <h2 id="pair-title">Connect your Mac</h2>
          <p>
            Open DeskDeck Host on your Mac and enter the six-digit code. Approve
            this headset on your Mac to finish.
          </p>
          <label>
            Headset name
            <input
              value={deviceName}
              maxLength={64}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </label>
          <label>
            Pairing code
            <input
              autoFocus
              className="pair-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              aria-invalid={!!pairError}
              aria-describedby="pair-error"
            />
          </label>
          <p id="pair-error" className="form-message" role="status">
            {pairError ||
              (pairing
                ? "Waiting for approval on your Mac…"
                : "Codes expire after two minutes.")}
          </p>
          <button className="primary full" disabled={pairing} type="submit">
            {pairing ? "Approve on your Mac" : "Pair with Mac"}
            <ArrowRight size={16} />
          </button>
          <p className="modal-footer">
            <ShieldCheck size={14} />
            Always approve from the Mac you own.
          </p>
        </form>
      </dialog>
      <dialog
        ref={commandDialog}
        onCancel={() => setPalette(false)}
        onClose={() => setPalette(false)}
        aria-label="Command palette"
        className="palette"
      >
        <div className="palette-search">
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search DeskDeck"
            ref={searchRef}
            aria-label="Search actions"
          />
          {query && (
            <button
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          )}
          <button onClick={() => setPalette(false)}>Esc</button>
        </div>
        <div className="palette-results">
          {actions.map((a) => (
            <button
              disabled={a.remote && !connected}
              key={a.name}
              onClick={() => {
                a.run();
                setPalette(false);
                setQuery("");
              }}
            >
              <Command size={16} />
              {a.name}
              <ArrowUpRight size={15} />
            </button>
          ))}
          {!actions.length && (
            <p>No matching actions. Try “focus” or “Safari”.</p>
          )}
        </div>
      </dialog>
    </div>
  );
}
