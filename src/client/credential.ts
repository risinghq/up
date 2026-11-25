import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Raycaster,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";

// World units. The card is 2:3, like a conference badge.
const W = 1.6;
const H = 2.4;
const DEPTH = 0.03;
const RADIUS = 0.12;
const SLOT = { w: 0.36, h: 0.08, y: H / 2 - 0.17 };
/** From the card's center to the clip the strap ends in. */
const HANG = H / 2 + 0.12;
const STRAP_WIDTH = 0.2;
const ROPE_LINKS = 8;
const ROPE_LENGTH = 1.25;
const FOV = 22;
const CAMERA_Z = 10;

const STEP = 1 / 120;
const GRAVITY = -18;
const ITERATIONS = 12;
/** The share of a point's velocity it keeps each step. */
const DAMPING = 0.99;

const TEXTURE_W = 1024;
const TEXTURE_H = 1536;
const FONT = '"Geist Variable", system-ui, sans-serif';
const MONO = '"Geist Mono Variable", ui-monospace, monospace';
const MARK = new Path2D(
  "M12 22A7 7 0 0 1 5 15A8 8 0 0 1 8 8A6 6 0 0 0 10 1A15 15 0 0 1 19 15A7 7 0 0 1 12 22ZM9 16a3 3 0 1 0 6 0a3 3 0 1 0-6 0Z",
);

type Face = {
  name: string;
  number: string;
  title: string;
  kind: string;
  date: string;
  ground: string;
  text: string;
  soft: string;
  strap: string;
};

type Point = { x: number; y: number; px: number; py: number; inv: number };

const point = (x: number, y: number, inv: number): Point => ({
  x,
  y,
  px: x,
  py: y,
  inv,
});

function roundedRect(
  shape: Shape,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
}

/** The card's outline with the strap's slot cut through it. */
function cardShape() {
  const shape = new Shape();
  roundedRect(shape, -W / 2, -H / 2, W, H, RADIUS);
  const slot = new Shape();
  roundedRect(
    slot,
    -SLOT.w / 2,
    SLOT.y - SLOT.h / 2,
    SLOT.w,
    SLOT.h,
    SLOT.h / 2,
  );
  shape.holes.push(slot);
  return shape;
}

/** A face of the card, with UVs that stretch the texture over the outline. */
function faceGeometry() {
  const geometry = new ShapeGeometry(cardShape(), 8);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < position.count; i++)
    uv.setXY(i, (position.getX(i) + W / 2) / W, (position.getY(i) + H / 2) / H);
  return geometry;
}

/** Breaks `text` into at most `max` lines that fit `width`. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  max: number,
) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  kept[max - 1] = `${kept[max - 1]}…`;
  return kept;
}

function drawFront(face: Face) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_W;
  canvas.height = TEXTURE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const pad = 96;
  const inner = TEXTURE_W - 2 * pad;

  ctx.fillStyle = face.ground;
  ctx.fillRect(0, 0, TEXTURE_W, TEXTURE_H);
  const glow = ctx.createRadialGradient(
    TEXTURE_W,
    0,
    0,
    TEXTURE_W,
    0,
    TEXTURE_W * 1.1,
  );
  glow.addColorStop(0, `${face.strap}88`);
  glow.addColorStop(1, `${face.strap}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, TEXTURE_W, TEXTURE_H);

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = face.soft;
  ctx.font = `500 44px ${FONT}`;
  ctx.fillText("up.rising.sh", pad, 330);
  ctx.save();
  ctx.translate(TEXTURE_W - pad - 72, 270);
  ctx.scale(3, 3);
  ctx.fill(MARK, "evenodd");
  ctx.restore();

  ctx.font = `500 44px ${FONT}`;
  ctx.fillText(face.kind, pad, 560);
  ctx.fillStyle = face.text;
  ctx.font = `600 84px ${FONT}`;
  let y = 660;
  for (const line of wrap(ctx, face.title, inner, 3)) {
    ctx.fillText(line, pad, y);
    y += 96;
  }
  ctx.fillStyle = face.soft;
  ctx.font = `500 48px ${FONT}`;
  ctx.fillText(face.date, pad, y + 16);

  ctx.fillStyle = `${face.soft}55`;
  ctx.fillRect(pad, 1150, inner, 3);
  ctx.fillStyle = face.text;
  ctx.font = `600 76px ${FONT}`;
  const name = wrap(ctx, face.name, inner - 260, 2);
  name.forEach((line, i) => ctx.fillText(line, pad, 1260 + i * 88));
  ctx.fillStyle = face.soft;
  ctx.font = `500 88px ${MONO}`;
  ctx.textAlign = "right";
  ctx.fillText(`#${face.number}`, TEXTURE_W - pad, 1260);
  return canvas;
}

function drawBack(face: Face) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_W;
  canvas.height = TEXTURE_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = face.ground;
  ctx.fillRect(0, 0, TEXTURE_W, TEXTURE_H);
  ctx.fillStyle = face.strap;
  ctx.save();
  ctx.translate(TEXTURE_W / 2 - 240, TEXTURE_H / 2 - 300);
  ctx.scale(20, 20);
  ctx.fill(MARK, "evenodd");
  ctx.restore();
  ctx.fillStyle = face.soft;
  ctx.font = `500 52px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("up.rising.sh", TEXTURE_W / 2, TEXTURE_H / 2 + 300);
  return canvas;
}

/** The strap's print: the site's name, repeated along its length. */
function drawStrap(face: Face) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = face.strap;
  ctx.fillRect(0, 0, 128, 512);
  ctx.fillStyle = face.text;
  ctx.font = `600 44px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(64, 256);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("up.rising.sh", 0, 0);
  return canvas;
}

/** Draws the ticket holder's credential in `box`, hanging from a strap. */
export async function showCredential(box: HTMLElement) {
  const face = box.dataset as unknown as Face;
  await Promise.all([
    document.fonts.load(`600 84px ${FONT}`),
    document.fonts.load(`500 88px ${MONO}`),
  ]);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  box.appendChild(canvas);
  box.hidden = false;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.z = CAMERA_Z;
  scene.add(new AmbientLight(0xffffff, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(3, 4, 6);
  scene.add(sun);

  const texture = (source: HTMLCanvasElement) => {
    const t = new CanvasTexture(source);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };

  const card = new Group();
  card.rotation.order = "ZYX";
  const body = new ExtrudeGeometry(cardShape(), {
    depth: DEPTH,
    bevelEnabled: false,
    curveSegments: 8,
  });
  body.translate(0, 0, -DEPTH / 2);
  const edge = new MeshStandardMaterial({ color: face.ground, roughness: 0.5 });
  const front = new Mesh(
    faceGeometry(),
    new MeshStandardMaterial({
      map: texture(drawFront(face)),
      roughness: 0.45,
    }),
  );
  front.position.z = DEPTH / 2 + 0.001;
  const back = new Mesh(
    faceGeometry(),
    new MeshStandardMaterial({ map: texture(drawBack(face)), roughness: 0.45 }),
  );
  back.rotation.y = Math.PI;
  back.position.z = -DEPTH / 2 - 0.001;
  const clip = new Mesh(
    new BoxGeometry(0.12, HANG - SLOT.y, 0.05),
    new MeshStandardMaterial({
      color: 0xb4b4bc,
      metalness: 0.8,
      roughness: 0.3,
    }),
  );
  clip.position.y = (HANG + SLOT.y) / 2;
  card.add(new Mesh(body, edge), front, back, clip);
  scene.add(card);

  const strapTexture = texture(drawStrap(face));
  strapTexture.wrapT = RepeatWrapping;
  const samples = 48;
  const strapGeometry = new BufferGeometry();
  const strapPosition = new BufferAttribute(
    new Float32Array(samples * 2 * 3),
    3,
  );
  const strapUv = new BufferAttribute(new Float32Array(samples * 2 * 2), 2);
  const index: number[] = [];
  for (let i = 0; i < samples - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  strapGeometry.setAttribute("position", strapPosition);
  strapGeometry.setAttribute("uv", strapUv);
  strapGeometry.setIndex(index);
  const strap = new Mesh(
    strapGeometry,
    new MeshStandardMaterial({
      map: strapTexture,
      side: DoubleSide,
      roughness: 0.8,
    }),
  );
  strap.frustumCulled = false;
  scene.add(strap);

  // The strap hangs from just above the box's top edge. The view's height in
  // world units depends only on the field of view, so the anchor never moves.
  const top = CAMERA_Z * Math.tan((FOV / 2) * (Math.PI / 180));
  const link = ROPE_LENGTH / ROPE_LINKS;
  // The strap starts swung out to the side, so the card falls in on load.
  const anchor = point(0, top + 0.3, 0);
  const links = Array.from({ length: ROPE_LINKS }, (_, i) =>
    point((i + 1) * link * 0.5, anchor.y - (i + 1) * link * 0.87, 1),
  );
  const rope = [anchor, ...links];
  const hook = links.at(-1) ?? anchor;
  const center = point(hook.x + HANG, hook.y, 0.25);
  let yaw = 0;
  let spin = 7;

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const solve = (a: Point, b: Point, rest: number, slack: boolean) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    if (slack && d <= rest) return;
    const w = a.inv + b.inv;
    if (w === 0) return;
    const k = (d - rest) / d / w;
    a.x += dx * k * a.inv;
    a.y += dy * k * a.inv;
    b.x -= dx * k * b.inv;
    b.y -= dy * k * b.inv;
  };

  let grab: { x: number; y: number } | null = null;
  let target = { x: 0, y: 0 };

  const step = () => {
    for (const p of [...links, center]) {
      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      p.px = p.x;
      p.py = p.y;
      if (p === center && grab) {
        p.x += (target.x - p.x) * 0.35;
        p.y += (target.y - p.y) * 0.35;
        spin += (p.x - p.px) * 18;
      } else {
        p.x += vx;
        p.y += vy + GRAVITY * STEP * STEP;
      }
    }
    const held = center.inv;
    if (grab) center.inv = 0;
    for (let n = 0; n < ITERATIONS; n++) {
      let prev = anchor;
      for (const p of links) {
        solve(prev, p, link, true);
        prev = p;
      }
      solve(hook, center, HANG, false);
    }
    center.inv = held;
    spin = (spin - 5 * Math.sin(yaw) * STEP) * 0.992;
    yaw += spin * STEP;
  };

  const tangent = new Vector3();
  const along: Vector3[] = [];
  const updateStrap = () => {
    along.length = 0;
    const points = rope.map((p) => new Vector3(p.x, p.y, 0));
    for (let i = 0; i < samples; i++) {
      const t = (i / (samples - 1)) * ROPE_LINKS;
      const k = Math.min(Math.floor(t), ROPE_LINKS - 1);
      const f = t - k;
      along.push(
        catmullRom(
          pick(points, k - 1),
          pick(points, k),
          pick(points, k + 1),
          pick(points, k + 2),
          f,
        ),
      );
    }
    let length = 0;
    for (let i = 0; i < samples; i++) {
      const p = pick(along, i);
      const prev = pick(along, i - 1);
      tangent.subVectors(pick(along, i + 1), prev).normalize();
      length += p.distanceTo(prev);
      const sx = -tangent.y * (STRAP_WIDTH / 2);
      const sy = tangent.x * (STRAP_WIDTH / 2);
      strapPosition.setXYZ(i * 2, p.x - sx, p.y - sy, 0);
      strapPosition.setXYZ(i * 2 + 1, p.x + sx, p.y + sy, 0);
      const v = length / (STRAP_WIDTH * 4);
      strapUv.setXY(i * 2, 1, v);
      strapUv.setXY(i * 2 + 1, 0, v);
    }
    strapPosition.needsUpdate = true;
    strapUv.needsUpdate = true;
    strapGeometry.computeVertexNormals();
  };

  const draw = () => {
    card.position.set(center.x, center.y, 0);
    card.rotation.set(0, yaw, Math.atan2(center.x - hook.x, hook.y - center.y));
    updateStrap();
    renderer.render(scene, camera);
  };

  const moving = () =>
    grab !== null ||
    Math.abs(spin) > 1e-3 ||
    Math.abs(Math.sin(yaw)) > 1e-3 ||
    [...rope, center].some(
      (p) => Math.abs(p.x - p.px) + Math.abs(p.y - p.py) > 1e-6,
    );

  let visible = true;
  let frame = 0;
  let last = 0;
  let lag = 0;
  const tick = (time: number) => {
    frame = 0;
    lag = Math.min(lag + (last ? (time - last) / 1000 : STEP), 1 / 20);
    last = time;
    while (lag >= STEP) {
      step();
      lag -= STEP;
    }
    draw();
    if (visible && moving()) frame = requestAnimationFrame(tick);
    else last = 0;
  };
  const wake = () => {
    if (!frame && visible) frame = requestAnimationFrame(tick);
  };

  const ray = new Raycaster();
  const ndc = new Vector2();
  const plane = new Plane(new Vector3(0, 0, 1), 0);
  const hitPoint = new Vector3();
  const aim = (x: number, y: number) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    ray.ray.intersectPlane(plane, hitPoint);
    return ray.intersectObject(card, true).length > 0;
  };
  const reach = ROPE_LENGTH + HANG;
  // The canvas ends at the box's top, so a lifted card stops a half-diagonal
  // below it, whatever its tilt.
  const ceiling = top - Math.hypot(W / 2, H / 2);
  const follow = () => {
    let x = hitPoint.x + (grab?.x ?? 0);
    let y = hitPoint.y + (grab?.y ?? 0);
    const d = Math.hypot(x - anchor.x, y - anchor.y);
    if (d > reach) {
      x = anchor.x + ((x - anchor.x) * reach) / d;
      y = anchor.y + ((y - anchor.y) * reach) / d;
    }

    target = { x, y: Math.min(y, ceiling) };
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (!aim(e.clientX, e.clientY)) return;
    grab = { x: center.x - hitPoint.x, y: center.y - hitPoint.y };
    follow();
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    wake();
  });
  canvas.addEventListener("pointermove", (e) => {
    const over = aim(e.clientX, e.clientY);
    if (grab) follow();
    else canvas.style.cursor = over ? "grab" : "";
  });
  const release = () => {
    grab = null;
    canvas.style.cursor = "";
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  // A touch on the card drags it; a touch beside it scrolls the page.
  canvas.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches[0];
      if (touch && aim(touch.clientX, touch.clientY)) e.preventDefault();
    },
    { passive: false },
  );

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
    wake();
  }).observe(box);
  new ResizeObserver(() => {
    resize();
    if (!frame) draw();
    wake();
  }).observe(canvas);
}

/** The item at `i`, clamped to the list's ends. */
const pick = <T>(list: T[], i: number) =>
  list[Math.min(Math.max(i, 0), list.length - 1)] as T;

function catmullRom(
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3,
  t: number,
) {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number) =>
    0.5 *
    (2 * b +
      (-a + c) * t +
      (2 * a - 5 * b + 4 * c - d) * t2 +
      (-a + 3 * b - 3 * c + d) * t3);
  return new Vector3(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), 0);
}
