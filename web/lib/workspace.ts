import * as THREE from "three";
import type { Input } from "./session";
export type Layout = {
  x: number;
  pitch: number;
  width: number;
  distance: number;
  curve: number;
  height: number;
  yaw: number;
  environment: string;
  focus: boolean;
};
export const defaultLayout: Layout = {
  x: 0,
  pitch: 0,
  width: 2.8,
  distance: 2.3,
  curve: 0.12,
  height: 1.65,
  yaw: 0,
  environment: "Dark Studio",
  focus: false,
};
export class Workspace {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.05, 70);
  monitor = new THREE.Group();
  screen: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  menu = new THREE.Group();
  dock = new THREE.Group();
  keyboard = new THREE.Group();
  floor: THREE.GridHelper;
  texture: THREE.VideoTexture;
  placeholder: THREE.CanvasTexture;
  cursor: THREE.Mesh;
  ray = new THREE.Raycaster();
  controllers: THREE.Group[] = [];
  sources: (XRInputSource | undefined)[] = [];
  actions = new Map<THREE.Object3D, () => void>();
  layout = { ...defaultLayout };
  grabbing?: THREE.Group;
  gripOffsets = new THREE.Matrix4();
  previousButtons = [[], []] as boolean[][];
  lastPointer = 0;
  aspect = 16 / 10;
  resizeObserver: ResizeObserver;
  private lastPreviewFrame = 0;
  private keyHandler = (e: KeyboardEvent) => {
    if (!this.renderer.xr.isPresenting || e.isComposing) return;
    e.preventDefault();
    this.send({
      type: "key",
      code: e.code,
      down: e.type === "keydown",
      meta: e.metaKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
    });
  };
  keyboardVisible = false;
  shift = false;
  constructor(
    public element: HTMLElement,
    public video: HTMLVideoElement,
    public send: (m: Input) => void,
    public changed: (l: Layout) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType("local-floor");
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 1.65, 0.7);
    this.camera.lookAt(0, 1.55, -2);
    this.scene.background = new THREE.Color("#080c12");
    this.scene.fog = new THREE.Fog("#080c12", 7, 25);
    this.floor = new THREE.GridHelper(40, 80, "#203349", "#14202d");
    this.scene.add(this.floor);
    this.texture = new THREE.VideoTexture(video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 1000;
    const x = c.getContext("2d")!;
    x.fillStyle = "#111720";
    x.fillRect(0, 0, 1600, 1000);
    x.strokeStyle = "#263344";
    x.strokeRect(24, 24, 1552, 952);
    x.textAlign = "center";
    x.fillStyle = "#5a89c9";
    x.font = "26px monospace";
    x.fillText("DESKDECK / DISPLAY 01", 800, 390);
    x.fillStyle = "#e3eaf4";
    x.font = "52px sans-serif";
    x.fillText("Your Mac belongs here.", 800, 490);
    x.fillStyle = "#8a99ac";
    x.font = "26px sans-serif";
    x.fillText(
      "Pair your Mac to bring your desktop into this space.",
      800,
      555,
    );
    this.placeholder = new THREE.CanvasTexture(c);
    this.placeholder.colorSpace = THREE.SRGBColorSpace;
    this.screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 1.75, 64, 1),
      new THREE.MeshBasicMaterial({
        map: this.placeholder,
        side: THREE.DoubleSide,
      }),
    );
    this.monitor.add(this.screen);
    this.scene.add(this.monitor);
    const bar = this.button(
      "GRAB TO MOVE  ·  STICK TO RESIZE",
      1.55,
      0.09,
      () => {},
    );
    bar.position.set(0, -1, 0);
    bar.name = "handle";
    this.monitor.add(bar);
    this.cursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.007, 10, 8),
      new THREE.MeshBasicMaterial({ color: "#77ccff", depthTest: false }),
    );
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    [
      ["Finder", "finder"],
      ["Safari", "safari"],
      ["Terminal", "terminal"],
      ["VS Code", "vscode"],
      ["Spotify", "spotify"],
    ].forEach(([label, id], i) => {
      const b = this.button(label, 0.35, 0.14, () =>
        this.send({ type: "launch", id }),
      );
      b.position.x = (i - 2) * 0.38;
      this.dock.add(b);
    });
    this.scene.add(this.dock);
    const options: [string, () => void][] = [
      [
        "Recenter",
        () => {
          this.update({
            ...defaultLayout,
            environment: this.layout.environment,
          });
          this.changed(this.layout);
        },
      ],
      [
        "Focus",
        () => {
          this.update({ ...this.layout, focus: !this.layout.focus });
          this.changed(this.layout);
        },
      ],
      [
        "Keyboard",
        () => {
          this.keyboardVisible = !this.keyboardVisible;
          this.keyboard.visible = this.keyboardVisible;
        },
      ],
      ["⌘ Tab", () => this.send({ type: "shortcut", id: "switch" })],
      ["Mission Control", () => this.send({ type: "shortcut", id: "mission" })],
      ["Exit VR", () => void this.renderer.xr.getSession()?.end()],
    ];
    options.forEach(([label, action], i) => {
      const b = this.button(label, 0.36, 0.12, action);
      b.position.set((i % 2) * 0.39, -Math.floor(i / 2) * 0.15, 0);
      this.menu.add(b);
    });
    this.menu.visible = false;
    this.scene.add(this.menu);
    const rows = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
    rows.forEach((row, r) =>
      Array.from(row).forEach((letter, i) => {
        const b = this.button(letter, 0.105, 0.11, () =>
          this.send({
            type: "text",
            text: this.shift ? letter.toUpperCase() : letter,
          }),
        );
        b.position.set((i - (row.length - 1) / 2) * 0.12, -r * 0.125, 0);
        this.keyboard.add(b);
      }),
    );
    [
      [
        "Shift",
        () => {
          this.shift = !this.shift;
        },
      ],
      ["Space", () => this.send({ type: "text", text: " " })],
      ["⌫", () => this.key("Backspace")],
      ["Enter", () => this.key("Enter")],
      ["Esc", () => this.key("Escape")],
    ].forEach((entry, i) => {
      const [label, action] = entry as [string, () => void];
      const b = this.button(label, 0.21, 0.11, action);
      b.position.set((i - 2) * 0.23, -0.51, 0);
      this.keyboard.add(b);
    });
    this.keyboard.position.set(0, 0.95, -1.3);
    this.keyboard.rotation.x = -0.3;
    this.keyboard.visible = false;
    this.scene.add(this.keyboard);
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      this.controllers.push(controller);
      this.scene.add(controller);
      controller.addEventListener("connected", (e) => {
        this.sources[i] = e.data as XRInputSource;
      });
      controller.addEventListener("disconnected", () => {
        this.sources[i] = undefined;
        this.send({ type: "release" });
        this.releaseGrab();
      });
      controller.addEventListener("selectstart", () =>
        this.select(controller, true),
      );
      controller.addEventListener("selectend", () =>
        this.send({ type: "button", button: 0, down: false }),
      );
      controller.addEventListener("squeezestart", () => {
        const hit = this.hit(controller);
        if (hit?.object.name === "handle") {
          this.grabbing = controller;
          this.gripOffsets
            .copy(controller.matrixWorld)
            .invert()
            .multiply(this.monitor.matrixWorld);
        } else if (hit?.object === this.screen)
          this.send({ type: "button", button: 2, down: true });
      });
      controller.addEventListener("squeezeend", () => {
        this.releaseGrab();
        this.send({ type: "button", button: 2, down: false });
      });
    }
    this.renderer.xr.addEventListener("sessionend", () => {
      this.send({ type: "release" });
      this.releaseGrab();
      this.menu.visible = false;
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(element);
    this.update(this.layout);
    window.addEventListener("keydown", this.keyHandler);
    window.addEventListener("keyup", this.keyHandler);
    this.renderer.setAnimationLoop(() => this.frame());
  }
  key(code: string) {
    this.send({ type: "key", code, down: true });
    this.send({ type: "key", code, down: false });
  }
  button(label: string, width: number, height: number, action: () => void) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = Math.max(64, Math.round((1024 * height) / width));
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#18212e";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#41516a";
    ctx.strokeRect(2, 2, c.width - 4, c.height - 4);
    ctx.fillStyle = "#eef4ff";
    ctx.font = `${Math.round(c.height * 0.32)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, c.width / 2, c.height / 2);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    this.actions.set(mesh, action);
    return mesh;
  }
  hit(controller: THREE.Group) {
    this.ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.ray.ray.direction
      .set(0, 0, -1)
      .transformDirection(controller.matrixWorld);
    return this.ray.intersectObjects(
      [
        this.screen,
        ...Array.from(this.actions.keys()).filter(
          (o) =>
            o.parent?.visible && (o.parent !== this.dock || this.dock.visible),
        ),
      ],
      false,
    )[0];
  }
  select(controller: THREE.Group, down: boolean) {
    const hit = this.hit(controller);
    if (!hit) return;
    if (hit.object === this.screen && hit.uv) {
      this.send({ type: "pointer", x: hit.uv.x, y: 1 - hit.uv.y });
      this.send({ type: "button", button: 0, down });
    } else this.actions.get(hit.object)?.();
  }
  releaseGrab() {
    if (!this.grabbing) return;
    this.grabbing = undefined;
    this.layout = {
      ...this.layout,
      x: THREE.MathUtils.clamp(this.monitor.position.x, -5, 5),
      pitch: THREE.MathUtils.clamp(this.monitor.rotation.x, -1.5, 1.5),
      height: THREE.MathUtils.clamp(this.monitor.position.y, 0.6, 3),
      distance: THREE.MathUtils.clamp(-this.monitor.position.z, 0.6, 5),
      yaw: THREE.MathUtils.clamp(this.monitor.rotation.y, -1, 1),
    };
    this.changed(this.layout);
  }
  update(layout: Layout) {
    this.layout = { ...layout };
    this.monitor.position.set(layout.x, layout.height, -layout.distance);
    this.monitor.rotation.set(layout.pitch, layout.yaw, 0);
    const geometry = new THREE.PlaneGeometry(
      layout.width,
      layout.width / this.aspect,
      64,
      1,
    );
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      position.setZ(i, layout.curve * x * x * 0.35);
    }
    geometry.computeVertexNormals();
    this.screen.geometry.dispose();
    this.screen.geometry = geometry;
    this.monitor.children[1].position.y =
      -layout.width / this.aspect / 2 - 0.085;
    this.dock.position.set(
      layout.x,
      Math.max(0.35, layout.height - layout.width / this.aspect / 2 - 0.33),
      -layout.distance + 0.15,
    );
    this.dock.visible = !layout.focus;
    this.floor.visible = !layout.focus && layout.environment !== "Void";
    const colors: Record<string, string> = {
      "Dark Studio": "#080c12",
      "Space Station": "#0b1524",
      "Cyber Loft": "#14101b",
      "Mountain Office": "#17232a",
      Void: "#020304",
      "Minimal Black Room": "#070707",
    };
    this.scene.background = new THREE.Color(
      colors[layout.environment] || "#080c12",
    );
    this.scene.fog = new THREE.Fog(
      colors[layout.environment] || "#080c12",
      7,
      25,
    );
  }
  resize() {
    const { clientWidth: w, clientHeight: h } = this.element;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  async enter() {
    if (!navigator.xr)
      throw Error("Open this HTTPS site in Meta Quest Browser to enter VR.");
    const session = await navigator.xr.requestSession("immersive-vr", {
      requiredFeatures: ["local-floor"],
      optionalFeatures: ["hand-tracking"],
    });
    await this.renderer.xr.setSession(session);
  }
  frame() {
    if (!this.renderer.xr.isPresenting) {
      if (
        document.hidden ||
        performance.now() - this.lastPreviewFrame < 1000 / 24
      )
        return;
      this.lastPreviewFrame = performance.now();
    }
    const live = this.video.readyState >= 2 && this.video.srcObject !== null;
    this.screen.material.map = live ? this.texture : this.placeholder;
    const aspect = live
      ? this.video.videoWidth / this.video.videoHeight
      : 16 / 10;
    if (aspect && Math.abs(aspect - this.aspect) > 0.01) {
      this.aspect = aspect;
      this.update(this.layout);
    }
    this.cursor.visible = false;
    for (const object of this.actions.keys()) {
      if (object instanceof THREE.Mesh) object.material.color.set(0xffffff);
    }
    if (this.grabbing) {
      const matrix = new THREE.Matrix4().multiplyMatrices(
        this.grabbing.matrixWorld,
        this.gripOffsets,
      );
      matrix.decompose(
        this.monitor.position,
        this.monitor.quaternion,
        this.monitor.scale,
      );
    }
    this.controllers.forEach((controller, i) => {
      const source = this.sources[i];
      if (!source) return;
      const hit = this.hit(controller);
      if (hit && this.renderer.xr.isPresenting) {
        this.cursor.position.copy(hit.point);
        if (this.actions.has(hit.object) && hit.object instanceof THREE.Mesh)
          hit.object.material.color.set(0x88bbff);
        this.cursor.visible = true;
        if (
          hit.object === this.screen &&
          hit.uv &&
          performance.now() - this.lastPointer > 16
        ) {
          this.send({ type: "pointer", x: hit.uv.x, y: 1 - hit.uv.y });
          this.lastPointer = performance.now();
        }
      }
      const gp = source.gamepad;
      if (!gp) return;
      const axis = gp.axes[3] || 0;
      if (Math.abs(axis) > 0.2) {
        if (this.grabbing === controller) {
          this.layout.width = THREE.MathUtils.clamp(
            this.layout.width - axis * 0.015,
            1,
            6,
          );
          const pos = this.monitor.position.clone(),
            q = this.monitor.quaternion.clone();
          this.update(this.layout);
          this.monitor.position.copy(pos);
          this.monitor.quaternion.copy(q);
        } else if (hit?.object === this.screen)
          this.send({ type: "scroll", y: axis * 12 });
      }
      gp.buttons.forEach((b, j) => {
        if (b.pressed && !this.previousButtons[i][j]) {
          if (source.handedness === "left" && j === 5) {
            this.menu.visible = !this.menu.visible;
            this.menu.position
              .setFromMatrixPosition(controller.matrixWorld)
              .add(new THREE.Vector3(0.08, 0.15, -0.25));
            this.menu.lookAt(
              this.renderer.xr
                .getCamera()
                .getWorldPosition(new THREE.Vector3()),
            );
          }
          if (source.handedness === "left" && j === 4) {
            this.keyboardVisible = !this.keyboardVisible;
            this.keyboard.visible = this.keyboardVisible;
          }
          if (source.handedness === "right" && j === 4)
            this.send({ type: "shortcut", id: "switch" });
          if (source.handedness === "right" && j === 5)
            this.send({ type: "shortcut", id: "mission" });
        }
        this.previousButtons[i][j] = b.pressed;
      });
    });
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    void this.renderer.xr.getSession()?.end();
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.keyHandler);
    window.removeEventListener("keyup", this.keyHandler);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => {
          if ("map" in m) (m.map as THREE.Texture | undefined)?.dispose();
          m.dispose();
        });
      }
    });
    this.texture.dispose();
    this.placeholder.dispose();
    this.floor.geometry.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
