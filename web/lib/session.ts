export type Input = Record<string, unknown>;
export type Stats = {
  fps?: number;
  width?: number;
  height?: number;
  bitrate?: number;
  rtt?: number;
  codec?: string;
  route?: string;
};
export class DesktopSession {
  pc?: RTCPeerConnection;
  ws?: WebSocket;
  channel?: RTCDataChannel;
  session = "";
  stopped = false;
  deadline = 0;
  retry?: ReturnType<typeof setTimeout>;
  timer?: ReturnType<typeof setInterval>;
  candidates: RTCIceCandidateInit[] = [];
  lastBytes = 0;
  lastTime = 0;
  constructor(
    public video: HTMLVideoElement,
    public state: (s: string) => void,
    public stats: (s: Stats) => void,
    public message: (m: Input) => void,
  ) {}
  connect() {
    if (this.stopped) return;
    this.state(this.deadline ? "Reconnecting…" : "Authenticating Mac…");
    this.ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/signal`,
    );
    const ws = this.ws;
    ws.onmessage = async (event) => {
      if (ws !== this.ws || this.stopped) return;
      try {
        const m = JSON.parse(event.data);
        if (m.type === "ready") ws.send(JSON.stringify({ type: "connect" }));
        if (m.type === "session") {
          this.session = m.session;
          await this.negotiate();
        }
        if (m.session && m.session !== this.session) return;
        if (m.type === "answer" && this.pc) {
          await this.pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
          for (const c of this.candidates) await this.pc.addIceCandidate(c);
          this.candidates = [];
        }
        if (m.type === "ice") {
          if (this.pc?.remoteDescription)
            await this.pc.addIceCandidate(m.candidate);
          else this.candidates.push(m.candidate);
        }
        if (m.type === "error") {
          if (m.retryable && this.deadline) {
            this.recover();
            return;
          }
          this.state(m.message);
          this.stop(false);
        }
        if (m.type === "interrupted") {
          this.recover();
          return;
        }
        if (m.type === "ended") {
          this.state("Session ended on your Mac.");
          this.stop(false);
        }
      } catch {
        this.state("Stream negotiation failed. Reconnect to try again.");
        this.stop(false);
      }
    };
    ws.onclose = (e) => {
      if (ws === this.ws && !this.stopped) {
        if (e.code === 1008) {
          this.state(
            "Device authorization expired or was removed. Pair again.",
          );
          this.stop(false);
        } else this.recover();
      }
    };
    ws.onerror = () => {
      /* close handles retry */
    };
  }
  private signal(m: Input) {
    if (this.ws?.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify({ ...m, session: this.session }));
  }
  private async negotiate() {
    this.disposePeer();
    this.state("Negotiating stream…");
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc = pc;
    this.channel = pc.createDataChannel("input", { ordered: true });
    this.channel.onmessage = (e) => {
      try {
        this.message(JSON.parse(e.data));
      } catch {
        /* invalid host message */
      }
    };
    let gotFrame = false;
    const ready = () => {
      if (gotFrame && this.channel?.readyState === "open") {
        this.state("Connected");
        this.deadline = 0;
      }
    };
    this.channel.onopen = () => {
      this.state("Waiting for desktop…");
      ready();
    };
    this.video.onloadeddata = () => {
      gotFrame = true;
      ready();
    };
    const transceiver = pc.addTransceiver("video", { direction: "recvonly" });
    const codecs = RTCRtpReceiver.getCapabilities("video")?.codecs || [];
    if (codecs.some((c) => c.mimeType.toLowerCase() === "video/h264")) {
      transceiver.setCodecPreferences([
        ...codecs.filter((c) => c.mimeType.toLowerCase() === "video/h264"),
        ...codecs.filter((c) => c.mimeType.toLowerCase() === "video/rtx"),
      ]);
    }
    pc.ontrack = (e) => {
      this.video.srcObject = e.streams[0] || new MediaStream([e.track]);
      void this.video
        .play()
        .catch(() => this.state("Tap the desktop to start playback."));
    };
    pc.onicecandidate = (e) => {
      if (e.candidate)
        this.signal({ type: "ice", candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (
        pc === this.pc &&
        (pc.connectionState === "failed" ||
          pc.connectionState === "disconnected")
      )
        this.recover();
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.signal({ type: "offer", sdp: offer.sdp });
    this.timer = setInterval(() => void this.sample().catch(() => {}), 1500);
    if (!this.deadline) this.deadline = Date.now() + 30000;
    this.retry = setTimeout(() => {
      if (pc.connectionState !== "connected" || !gotFrame) this.recover();
    }, 12000);
  }
  send(m: Input) {
    if (
      this.channel?.readyState === "open" &&
      this.channel.bufferedAmount < 65536
    )
      this.channel.send(JSON.stringify(m));
  }
  private recover() {
    if (this.stopped) return;
    if (!this.deadline) this.deadline = Date.now() + 30000;
    if (Date.now() >= this.deadline) {
      this.state("Connection lost. Check Wi-Fi and connect again.");
      this.stop(false);
      return;
    }
    this.state("Connection lost · reconnecting…");
    this.disposePeer();
    const ws = this.ws;
    this.ws = undefined;
    ws?.close();
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.connect(), 2000);
  }
  private async sample() {
    const pc = this.pc;
    if (!pc) return;
    const report = await pc.getStats();
    const next: Stats = {};
    report.forEach((s) => {
      if (s.type === "inbound-rtp" && s.kind === "video") {
        next.fps = s.framesPerSecond;
        next.width = s.frameWidth;
        next.height = s.frameHeight;
        if (this.lastTime)
          next.bitrate = Math.max(
            0,
            ((s.bytesReceived - this.lastBytes) * 8) /
              (s.timestamp - this.lastTime) /
              1000,
          );
        this.lastTime = s.timestamp;
        this.lastBytes = s.bytesReceived;
        next.codec = report.get(s.codecId)?.mimeType?.replace("video/", "");
      }
      if (
        s.type === "candidate-pair" &&
        s.state === "succeeded" &&
        s.nominated
      ) {
        next.rtt =
          s.currentRoundTripTime === undefined
            ? undefined
            : s.currentRoundTripTime * 1000;
        next.route =
          report.get(s.localCandidateId)?.candidateType === "relay" ||
          report.get(s.remoteCandidateId)?.candidateType === "relay"
            ? "Relay"
            : "Direct peer";
      }
    });
    this.stats(next);
  }
  private disposePeer() {
    clearInterval(this.timer);
    clearTimeout(this.retry);
    this.send({ type: "release" });
    const pc = this.pc;
    this.pc = undefined;
    pc?.close();
    this.channel = undefined;
    this.candidates = [];
    this.lastTime = 0;
    this.lastBytes = 0;
  }
  stop(update = true) {
    this.stopped = true;
    this.disposePeer();
    this.ws?.close();
    this.ws = undefined;
    this.video.onloadeddata = null;
    this.video.srcObject = null;
    this.stats({});
    if (update) this.state("Disconnected");
  }
}
