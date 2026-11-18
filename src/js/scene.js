/**
 * WebGL layer: an interactive neural-network sphere (hero) floating in a
 * slow particle field. Everything is procedural — no external models/textures.
 *
 * Performance notes
 *  - One renderer / one fixed canvas for the whole page.
 *  - Node & particle counts scale down on small or low-power devices.
 *  - Pixel ratio is capped; rendering pauses when the tab is hidden and
 *    drops to ~30fps once the hero sphere is scrolled out of view.
 *  - All geometries/materials are disposed in dispose().
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  IcosahedronGeometry,
  LineSegments,
  MathUtils,
  PerspectiveCamera,
  Plane,
  Points,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  EdgesGeometry,
} from 'three';

const PURPLE = new Color('#8b5cf6');
const VIOLET = new Color('#c4b5fd');
const CYAN = new Color('#22d3ee');

const CAMERA_Z = 6;
const FOV = 40;

export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

function getQuality() {
  const small = window.matchMedia('(max-width: 768px)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const lowPower = small || cores <= 4;
  return {
    nodes: small ? 420 : lowPower ? 620 : 900,
    ring: small ? 260 : 520,
    field: small ? 450 : lowPower ? 900 : 1400,
    maxDegree: small ? 3 : 4,
    dpr: Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2),
    antialias: !small,
  };
}

/* ---------------------------------------------------------------- shaders */

const NODE_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSizeScale;
  uniform vec3 uPointer;
  uniform float uPointerStrength;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 p = position;
    // gentle per-node breathing along the normal
    p += normalize(position) * sin(uTime * 0.9 + aSeed * 6.2831) * 0.018;

    vec4 world = modelMatrix * vec4(p, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * position);
    float facing = dot(n, normalize(cameraPosition - world.xyz));

    float hover = smoothstep(0.85, 0.0, distance(world.xyz, uPointer)) * uPointerStrength;
    float twinkle = 0.78 + 0.22 * sin(uTime * 2.2 + aSeed * 37.0);

    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * (1.0 + hover * 1.4) * twinkle * uPixelRatio * uSizeScale / -mv.z;

    vColor = mix(aColor, vec3(0.85, 0.97, 1.0), hover * 0.6);
    vAlpha = mix(0.16, 1.0, smoothstep(-0.6, 0.7, facing)) * (0.85 + hover * 0.4);
  }
`;

const NODE_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = pow(smoothstep(0.5, 0.0, d), 2.2);
    float core = smoothstep(0.14, 0.0, d);
    float a = (glow * 0.75 + core) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * (0.7 + core * 0.8), a);
  }
`;

const EDGE_VERT = /* glsl */ `
  attribute float aT;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  varying float vT;
  varying float vSeed;
  varying float vFacing;
  varying vec3 vColor;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * position);
    vFacing = smoothstep(-0.5, 0.8, dot(n, normalize(cameraPosition - world.xyz)));
    vT = aT;
    vSeed = aSeed;
    vColor = aColor;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EDGE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  varying float vT;
  varying float vSeed;
  varying float vFacing;
  varying vec3 vColor;

  void main() {
    // A subset of edges carries a travelling "signal" pulse
    float isActive = step(0.72, fract(vSeed * 17.31));
    float head = fract(uTime * (0.18 + fract(vSeed * 7.7) * 0.25) + vSeed);
    float pulse = smoothstep(0.14, 0.0, abs(vT - head)) * isActive;
    float base = 0.16 + 0.07 * fract(vSeed * 3.1);
    float a = (base + pulse * 0.95) * (0.15 + vFacing * 0.85) * uOpacity;
    vec3 col = mix(vColor, vec3(0.75, 0.98, 1.0), pulse * 0.7);
    gl_FragColor = vec4(col, a);
  }
`;

const FIELD_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vMix;

  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.05 + aSeed * 12.0) * 0.25;
    p.y += cos(uTime * 0.04 + aSeed * 9.0) * 0.25;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (18.0 / -mv.z);
    vAlpha = (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 0.8 + aSeed * 50.0))) * smoothstep(40.0, 6.0, -mv.z);
    vMix = fract(aSeed * 3.7);
  }
`;

const FIELD_FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vAlpha;
  varying float vMix;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vAlpha * 0.55;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(uColorA, uColorB, vMix), a);
  }
`;

const WIRE_VERT = /* glsl */ `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WIRE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() { gl_FragColor = vec4(uColor, uOpacity); }
`;

/* ------------------------------------------------------------ geometry */

/** Evenly distributed points on a sphere (Fibonacci lattice) with slight jitter. */
function fibonacciSphere(count, radius) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i + (Math.random() - 0.5) * 0.35;
    const jitter = radius * (0.94 + Math.random() * 0.1);
    pts.push(new Vector3(Math.cos(theta) * r * jitter, y * jitter, Math.sin(theta) * r * jitter));
  }
  return pts;
}

function buildNodes(points) {
  const n = points.length;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const seed = new Float32Array(n);
  const color = new Float32Array(n * 3);
  const tmp = new Color();
  points.forEach((p, i) => {
    pos.set([p.x, p.y, p.z], i * 3);
    const hub = Math.random() < 0.08;
    size[i] = hub ? 16 + Math.random() * 9 : 6 + Math.random() * 6;
    seed[i] = Math.random();
    // colour drifts from purple (bottom-left) to cyan (top-right) with randomness
    const t = MathUtils.clamp(0.5 + (p.x + p.y) * 0.32 + (Math.random() - 0.5) * 0.5, 0, 1);
    tmp.copy(PURPLE).lerp(CYAN, t);
    if (hub) tmp.lerp(VIOLET, 0.35);
    color.set([tmp.r, tmp.g, tmp.b], i * 3);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
  geo.setAttribute('aColor', new BufferAttribute(color, 3));
  return geo;
}

/** Connect each node to its nearest neighbours (bounded degree) → neural mesh. */
function buildEdges(points, maxDegree, radius) {
  const n = points.length;
  const threshold = Math.sqrt((4 * Math.PI) / n) * radius * 1.45;
  const t2 = threshold * threshold;
  const degree = new Uint8Array(n);
  const pairs = [];
  for (let i = 0; i < n; i++) {
    if (degree[i] >= maxDegree) continue;
    const a = points[i];
    for (let j = i + 1; j < n; j++) {
      if (degree[j] >= maxDegree) continue;
      if (a.distanceToSquared(points[j]) < t2) {
        pairs.push(i, j);
        degree[i]++;
        degree[j]++;
        if (degree[i] >= maxDegree) break;
      }
    }
  }
  // A few long-range "synapses" across the sphere for depth
  const longLinks = Math.round(n * 0.02);
  for (let k = 0; k < longLinks; k++) {
    pairs.push(Math.floor(Math.random() * n), Math.floor(Math.random() * n));
  }

  const edgeCount = pairs.length / 2;
  const pos = new Float32Array(edgeCount * 6);
  const t = new Float32Array(edgeCount * 2);
  const seed = new Float32Array(edgeCount * 2);
  const color = new Float32Array(edgeCount * 6);
  const tmp = new Color();
  for (let e = 0; e < edgeCount; e++) {
    const a = points[pairs[e * 2]];
    const b = points[pairs[e * 2 + 1]];
    pos.set([a.x, a.y, a.z, b.x, b.y, b.z], e * 6);
    t[e * 2] = 0;
    t[e * 2 + 1] = 1;
    const s = Math.random();
    seed[e * 2] = s;
    seed[e * 2 + 1] = s;
    tmp.copy(PURPLE).lerp(CYAN, Math.random());
    color.set([tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b], e * 6);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aT', new BufferAttribute(t, 1));
  geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
  geo.setAttribute('aColor', new BufferAttribute(color, 3));
  return geo;
}

/** Thin tilted ring of particles orbiting the sphere. */
function buildRing(count, radius) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const tmp = new Color();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.05;
    const r = radius * (1 + (Math.random() - 0.5) * 0.08);
    pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.04, Math.sin(a) * r], i * 3);
    size[i] = 2 + Math.random() * 3.5;
    seed[i] = Math.random();
    tmp.copy(CYAN).lerp(VIOLET, Math.random() * 0.6);
    color.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
  geo.setAttribute('aColor', new BufferAttribute(color, 3));
  return geo;
}

/** Ambient particle field spread through a deep volume behind the content. */
function buildField(count) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set(
      [(Math.random() - 0.5) * 34, (Math.random() - 0.5) * 60 - 18, -4 - Math.random() * 26],
      i * 3,
    );
    size[i] = 1 + Math.random() * 2.2;
    seed[i] = Math.random();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
  return geo;
}

/* ---------------------------------------------------------------- scene */

export function initScene({ canvas, anchor, reducedMotion = false }) {
  const q = getQuality();

  const renderer = new WebGLRenderer({
    canvas,
    antialias: q.antialias,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(q.dpr);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAMERA_Z);

  /* --- neural sphere --- */
  const sphere = new Group(); // positioned/scaled to match the hero anchor
  const spin = new Group(); // auto-rotation + pointer tilt
  sphere.add(spin);
  scene.add(sphere);

  const points = fibonacciSphere(q.nodes, 1);

  const sharedUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: q.dpr },
  };

  const nodeMat = new ShaderMaterial({
    vertexShader: NODE_VERT,
    fragmentShader: NODE_FRAG,
    uniforms: {
      ...sharedUniforms,
      uSizeScale: { value: CAMERA_Z },
      uPointer: { value: new Vector3(99, 99, 99) },
      uPointerStrength: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const nodeGeo = buildNodes(points);
  spin.add(new Points(nodeGeo, nodeMat));

  const edgeMat = new ShaderMaterial({
    vertexShader: EDGE_VERT,
    fragmentShader: EDGE_FRAG,
    uniforms: { uTime: sharedUniforms.uTime, uOpacity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const edgeGeo = buildEdges(points, q.maxDegree, 1);
  spin.add(new LineSegments(edgeGeo, edgeMat));

  // inner geometric core
  const coreGeo = new EdgesGeometry(new IcosahedronGeometry(0.42, 1));
  const coreMat = new ShaderMaterial({
    vertexShader: WIRE_VERT,
    fragmentShader: WIRE_FRAG,
    uniforms: { uColor: { value: VIOLET.clone() }, uOpacity: { value: 0.18 } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const core = new LineSegments(coreGeo, coreMat);
  spin.add(core);

  // orbiting particle ring
  const ringGeo = buildRing(q.ring, 1.42);
  const ringMat = new ShaderMaterial({
    vertexShader: NODE_VERT,
    fragmentShader: NODE_FRAG,
    uniforms: {
      ...sharedUniforms,
      uSizeScale: { value: CAMERA_Z },
      uPointer: { value: new Vector3(99, 99, 99) },
      uPointerStrength: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const ring = new Points(ringGeo, ringMat);
  const ringPivot = new Group();
  ringPivot.rotation.set(MathUtils.degToRad(72), 0, MathUtils.degToRad(-18));
  ringPivot.add(ring);
  sphere.add(ringPivot);

  /* --- background particle field --- */
  const fieldGeo = buildField(q.field);
  const fieldMat = new ShaderMaterial({
    vertexShader: FIELD_VERT,
    fragmentShader: FIELD_FRAG,
    uniforms: {
      ...sharedUniforms,
      uColorA: { value: VIOLET.clone() },
      uColorB: { value: CYAN.clone() },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const field = new Points(fieldGeo, fieldMat);
  scene.add(field);

  /* --- layout: keep the sphere glued to the hero anchor element --- */
  const view = { w: 1, h: 1, worldPerPx: 1, anchorDocTop: 0, anchorRect: null };

  function measure() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    renderer.setSize(view.w, view.h, false);
    camera.aspect = view.w / view.h;
    camera.updateProjectionMatrix();
    const visibleH = 2 * Math.tan(MathUtils.degToRad(FOV / 2)) * CAMERA_Z;
    view.worldPerPx = visibleH / view.h;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      view.anchorRect = { left: r.left, width: r.width, height: r.height };
      view.anchorDocTop = r.top + window.scrollY;
    }
  }

  const layout = { x: 0, y: 0, scale: 1, visible: true, heroProgress: 0 };

  function updateLayout() {
    const scrollY = window.scrollY;
    if (!view.anchorRect) return;
    const { left, width, height } = view.anchorRect;
    const top = view.anchorDocTop - scrollY;
    const cx = left + width / 2;
    const cy = top + height / 2;
    layout.x = (cx - view.w / 2) * view.worldPerPx;
    layout.y = -(cy - view.h / 2) * view.worldPerPx;
    layout.scale = (Math.min(width, height) / 2) * view.worldPerPx * 0.7;
    layout.visible = top + height > -50;
    layout.heroProgress = MathUtils.clamp(-top / Math.max(height, 1), 0, 1);
  }

  /* --- pointer interaction --- */
  const pointer = new Vector2(0, 0);
  const pointerTarget = new Vector2(0, 0);
  const pointerNdc = new Vector2(10, 10);
  let pointerActive = false;
  const raycaster = new Raycaster();
  const plane = new Plane(new Vector3(0, 0, 1), 0);
  const hit = new Vector3();

  function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
    pointerTarget.set((e.clientX / view.w) * 2 - 1, -(e.clientY / view.h) * 2 + 1);
    pointerNdc.copy(pointerTarget);
    pointerActive = true;
  }
  function onPointerLeave() {
    pointerActive = false;
    pointerTarget.set(0, 0);
  }

  /* --- render loop --- */
  let raf = 0;
  let running = false;
  let last = performance.now();
  let elapsed = Math.random() * 100;
  let frame = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    updateLayout();
    // Off-hero: halve the frame rate, only the ambient field is visible
    frame++;
    if (!layout.visible && frame % 2) return;

    elapsed += dt;
    sharedUniforms.uTime.value = elapsed;
    step(dt);
    renderer.render(scene, camera);
  }

  const baseSpin = { y: 0, x: 0 };

  function step(dt) {
    // smooth pointer
    pointer.lerp(pointerTarget, 1 - Math.pow(0.001, dt));

    // camera drift → parallax
    camera.position.x = pointer.x * 0.25;
    camera.position.y = pointer.y * 0.18;
    camera.lookAt(0, camera.position.y * 0.3, 0);

    // sphere placement + scroll-out
    sphere.visible = layout.visible;
    const fade = 1 - layout.heroProgress;
    sphere.position.set(layout.x, layout.y, 0);
    sphere.scale.setScalar(layout.scale * (0.9 + fade * 0.1));
    edgeMat.uniforms.uOpacity.value = fade;

    if (!reducedMotion) {
      baseSpin.y += dt * 0.09;
      baseSpin.x = Math.sin(elapsed * 0.15) * 0.12;
      ringPivot.rotation.y += dt * 0.12;
      core.rotation.y -= dt * 0.2;
      core.rotation.x += dt * 0.07;
      sphere.position.y += Math.sin(elapsed * 0.6) * 0.04 * layout.scale;
    }
    spin.rotation.y = baseSpin.y + pointer.x * 0.45;
    spin.rotation.x = baseSpin.x - pointer.y * 0.3;

    // pointer → world point on the sphere's plane for node highlighting
    const strength = nodeMat.uniforms.uPointerStrength;
    if (pointerActive && layout.visible) {
      raycaster.setFromCamera(pointerNdc, camera);
      plane.constant = 0;
      if (raycaster.ray.intersectPlane(plane, hit)) {
        // project onto the front of the sphere so highlighted nodes face the viewer
        hit.z = layout.scale * 0.6;
        nodeMat.uniforms.uPointer.value.copy(hit);
      }
      strength.value = MathUtils.lerp(strength.value, 1, 0.08);
    } else {
      strength.value = MathUtils.lerp(strength.value, 0, 0.05);
    }
    nodeMat.uniforms.uSizeScale.value = CAMERA_Z * Math.max(layout.scale, 0.4);
    ringMat.uniforms.uSizeScale.value = CAMERA_Z * Math.max(layout.scale, 0.4);

    // ambient field parallax with scroll
    field.position.y = window.scrollY * view.worldPerPx * 0.35;
    field.rotation.y = pointer.x * 0.05;
  }

  function renderStatic() {
    updateLayout();
    step(0.016);
    renderer.render(scene, camera);
  }

  function start() {
    if (running || reducedMotion) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  /* --- events --- */
  let resizeRaf = 0;
  function onResize() {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      measure();
      if (reducedMotion) renderStatic();
    });
  }

  let scrollRaf = 0;
  function onScroll() {
    if (!reducedMotion) return;
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(renderStatic);
  }

  function onVisibility() {
    if (document.hidden) stop();
    else start();
  }

  function onContextLost(e) {
    e.preventDefault();
    stop();
    document.documentElement.classList.add('no-webgl');
    canvas.classList.remove('is-ready');
  }

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onPointerLeave);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);

  // Anchor size can change once fonts load / layout settles
  const ro = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;
  ro?.observe(anchor || document.body);

  measure();
  if (reducedMotion) renderStatic();
  else start();
  requestAnimationFrame(() => canvas.classList.add('is-ready'));

  /* --- teardown --- */
  function dispose() {
    stop();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('pointermove', onPointerMove);
    document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    document.removeEventListener('visibilitychange', onVisibility);
    canvas.removeEventListener('webglcontextlost', onContextLost);
    ro?.disconnect();
    [nodeGeo, edgeGeo, coreGeo, ringGeo, fieldGeo].forEach((g) => g.dispose());
    [nodeMat, edgeMat, coreMat, ringMat, fieldMat].forEach((m) => m.dispose());
    renderer.dispose();
  }

  return { dispose };
}
