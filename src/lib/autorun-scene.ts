import * as THREE from "three";
import { SVGRenderer } from "three/addons/renderers/SVGRenderer.js";
import { CHECKPOINTS, COURSE_LENGTH, GAPS, ITEMS, OBSTACLES, ROAD_HALF_WIDTH, STEP, coursePoint, newRun, obstacleX, stepRun, type RunState, type Input } from "./autorun";
import { createRunner } from "./runner-model";
import { GameAudio } from "./game-audio";

export type Hud = { phase: RunState["phase"]; time: number; distance: number; checkpoint: number; coins: number; deaths: number; speed: number; boost: boolean; height: number; gamepad: boolean; input: "keyboard" | "gamepad" | "touch"; paused: boolean; software: boolean };
export type RunResult = { timeMs: number; coins: number; input: Hud["input"]; runId: string };
export type GameHandle = { start(): void; mute(value: boolean): void; pause(value: boolean): void; touch(key: "left" | "right" | "jump" | "boost", down: boolean): void; dispose(): void };

function frameAt(s: number) {
  const p = coursePoint(s), a = coursePoint(s - .1), b = coursePoint(s + .1);
  const back = new THREE.Vector3(a.x - b.x, a.y - b.y, a.z - b.z).normalize();
  const right = new THREE.Vector3(back.z, 0, -back.x).normalize();
  const up = new THREE.Vector3().crossVectors(back, right);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
  return { position: new THREE.Vector3(p.x, p.y, p.z), right, up, quaternion };
}
function world(s: number, x = 0, y = 0) { const f = frameAt(s); return f.position.addScaledVector(f.right, x).addScaledVector(f.up, y); }

export function createAutorunScene(mount: HTMLElement, onHud: (hud: Hud) => void, onFinish: (result: RunResult) => void, onStart: () => void): GameHandle {
  let renderer: THREE.WebGLRenderer | SVGRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  } catch {
    // Keep the same 3D scene/physics usable when a device has disabled its GPU.
    renderer = new SVGRenderer(); renderer.setQuality("low");
  }
  const software = renderer instanceof SVGRenderer;
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.domElement.classList.add("game-canvas"); renderer.domElement.setAttribute("aria-label", "カーブする大阪コースを背面から走る3Dゲーム");
  mount.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x061411); scene.fog = new THREE.FogExp2(0x061411, .0065);
  const camera = new THREE.PerspectiveCamera(64, mount.clientWidth / mount.clientHeight, .1, 350);
  scene.add(new THREE.HemisphereLight(0xc9ffef, 0x1d2929, 2.8));
  const sun = new THREE.DirectionalLight(0xffffff, 3.5); sun.position.set(-15, 28, 12); scene.add(sun);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x182824, roughness: .7, metalness: .25, side: THREE.DoubleSide });
  const lime = new THREE.MeshStandardMaterial({ color: 0x93ff45, emissive: 0x459d16, emissiveIntensity: 1.5 });
  const cyan = new THREE.MeshStandardMaterial({ color: 0x51f4db, emissive: 0x138b87, emissiveIntensity: 1.2 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xff526f, emissive: 0x80132a, emissiveIntensity: .8 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xffbf4a, emissive: 0x8d3a0f, emissiveIntensity: .6 });
  const roadVertices: number[] = [], lines: number[] = [], lanes: number[] = [];
  const add = (array: number[], v: THREE.Vector3) => array.push(v.x, v.y, v.z);
  for (let s = -18; s < COURSE_LENGTH + 25; s++) {
    if (GAPS.some(g => s >= g.start && s < g.end)) continue;
    const a = world(s, -ROAD_HALF_WIDTH), b = world(s, ROAD_HALF_WIDTH), c = world(s + 1, ROAD_HALF_WIDTH), d = world(s + 1, -ROAD_HALF_WIDTH);
    [a, b, c, a, c, d].forEach(v => add(roadVertices, v));
    for (const side of [-1, 1]) { add(lines, world(s, side * ROAD_HALF_WIDTH, .06)); add(lines, world(s + 1, side * ROAD_HALF_WIDTH, .06)); }
    if (s % 8 < 4) for (const x of [-1.7, 1.7]) { add(lanes, world(s, x, .025)); add(lanes, world(s + 1, x, .025)); }
  }
  const roadGeometry = new THREE.BufferGeometry(); roadGeometry.setAttribute("position", new THREE.Float32BufferAttribute(roadVertices, 3)); roadGeometry.computeVertexNormals();
  scene.add(new THREE.Mesh(roadGeometry, roadMat));
  for (const [vertices, color] of [[lines, 0xa0ff54], [lanes, 0x3e7061]] as const) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color })));
  }
  const place = (object: THREE.Object3D, s: number, x = 0, y = 0) => { object.position.copy(world(s, x, y)); object.quaternion.copy(frameAt(s).quaternion); scene.add(object); };
  // Gap warning strips are visible far enough ahead to jump at full boost speed.
  GAPS.forEach(gap => {
    for (const s of [gap.start - 4, gap.start - 2, gap.end]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(10.4, .045, .25), orange); place(strip, s, 0, .03);
    }
  });
  const obstacles = OBSTACLES.map(o => {
    const group = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), o.w > 8 ? pink : orange); box.position.y = o.h / 2; group.add(box);
    const border = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0xffe7c0 })); border.position.copy(box.position); group.add(border);
    place(group, o.s, o.x); return group;
  });
  const diamonds = ITEMS.map(item => {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(item.boost ? .5 : .33), item.boost ? cyan : lime);
    place(mesh, item.s, item.x, item.y); return mesh;
  });
  const gates = [...CHECKPOINTS, COURSE_LENGTH].map((s, i) => {
    const group = new THREE.Group(), mat = i === 3 ? lime : cyan;
    for (const x of [-5, 5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.22, 6.5, .35), mat); p.position.set(x, 3.25, 0); group.add(p); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(10.3, .32, .4), mat); top.position.y = 6.5; group.add(top);
    if (i === 3) for (let j = 0; j < 16; j++) { const tile = new THREE.Mesh(new THREE.BoxGeometry(.62, .4, .08), new THREE.MeshBasicMaterial({ color: j % 2 ? 0xffffff : 0x132218 })); tile.position.set(-4.65 + j * .62, 5.9, 0); group.add(tile); }
    place(group, s); return group;
  });
  // Instanced skyline follows the bends; low draw count also suits mobile GPUs.
  const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x122e29, roughness: .8 }), 180);
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .12, 1), new THREE.MeshBasicMaterial({ color: 0x4c9982 }), 720);
  const dummy = new THREE.Object3D();
  const softwareBuildings: THREE.Mesh[] = [];
  for (let i = 0; i < 180; i++) {
    const s = i * 4 - 12, x = (i % 2 ? -1 : 1) * (15 + i % 5 * 5), h = 7 + (i * 13 % 28), w = 4 + i % 4;
    dummy.position.copy(world(s, x)); dummy.position.y += h / 2 - 9; dummy.quaternion.copy(frameAt(s).quaternion); dummy.scale.set(w, h, w);
    dummy.updateMatrix(); buildings.setMatrixAt(i, dummy.matrix);
    if (software) { const building = new THREE.Mesh(buildings.geometry, buildings.material); building.position.copy(dummy.position); building.quaternion.copy(dummy.quaternion); building.scale.copy(dummy.scale); building.userData.s = s; scene.add(building); softwareBuildings.push(building); }
    for (let j = 0; j < 4; j++) {
      dummy.position.copy(world(s, x)); dummy.position.y += h * (j + 1) / 5 - 9; dummy.scale.set(w + .04, 1, w + .04); dummy.updateMatrix(); windows.setMatrixAt(i * 4 + j, dummy.matrix);
    }
  }
  if (!software) scene.add(buildings, windows);
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x2a4f46, metalness: .5, roughness: .3 });
  // Stepped glass tower and illuminated observation tower evoke Osaka's skyline.
  for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(10 - i * 2, 20, 9 - i), towerMaterial); place(t, 285, -40 + i, i * 18 + 6); }
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.8, 2, 35, 6), towerMaterial); shaft.position.y = 14; tower.add(shaft);
  for (const y of [26, 29]) { const deck = new THREE.Mesh(new THREE.CylinderGeometry(4, 3.4, 1.5, 8), lime); deck.position.y = y; tower.add(deck); }
  const spire = new THREE.Mesh(new THREE.ConeGeometry(.6, 10, 6), cyan); spire.position.y = 35; tower.add(spire); place(tower, 80, 26);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshStandardMaterial({ color: 0x092822, metalness: .75, roughness: .3 })); water.rotation.x = -Math.PI / 2; water.position.set(0, -10, -300); scene.add(water);

  const runner = createRunner(); scene.add(runner.root);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.65, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .4, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  let state = newRun(); state.phase = "ready";
  let runId = "", last = performance.now(), accumulator = 0, frame = 0, hudAt = 0, paused = false, disposed = false;
  let inputType: Hud["input"] = "keyboard", gamepad = false, padStart = false, padJump = false, cameraSnap = true;
  const keys = new Set<string>(), touches = new Set<string>();
  const audio = new GameAudio();
  const publish = () => onHud({ phase: state.phase, time: state.time * 1000, distance: state.s, checkpoint: state.checkpoint, coins: state.coins, deaths: state.deaths, speed: state.speed, boost: state.boost > 0, height: state.y, gamepad, input: inputType, paused, software });
  const start = () => {
    state = newRun(); runId = crypto.randomUUID(); inputType = "keyboard"; accumulator = 0; cameraSnap = true; paused = false;
    diamonds.forEach(d => { d.visible = true; }); audio.unlock(); onStart(); publish();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,button,[contenteditable='true']")) return;
    if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    audio.unlock();
    if ((e.code === "Space" || e.code === "Enter") && state.phase === "ready") start();
    else if (e.code === "KeyR") start();
    else if (e.code === "KeyP" || e.code === "Escape") { paused = !paused; publish(); }
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const clear = () => { keys.clear(); touches.clear(); };
  const visibility = () => { clear(); accumulator = 0; last = performance.now(); if (document.hidden) audio.pause(); };
  window.addEventListener("keydown", onKeyDown, { passive: false }); window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", clear); document.addEventListener("visibilitychange", visibility);
  const resize = new ResizeObserver(() => { if (!mount.clientWidth || !mount.clientHeight) return; renderer.setSize(mount.clientWidth, mount.clientHeight); camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); }); resize.observe(mount);
  const cameraTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3(), smoothLook = new THREE.Vector3();
  const animate = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min((now - last) / 1000, .1); last = now;
    if (document.hidden) return;
    const pad = navigator.getGamepads?.().find(p => p?.connected);
    gamepad = Boolean(pad);
    const a = Boolean(pad?.buttons[0]?.pressed), menu = Boolean(pad?.buttons[9]?.pressed);
    const editing = document.activeElement instanceof HTMLElement && Boolean(document.activeElement.closest("input,textarea,[contenteditable='true']"));
    if (!editing && ((a && !padJump && state.phase === "ready") || (menu && !padStart))) { start(); inputType = "gamepad"; }
    padJump = a; padStart = menu;
    const axis = Math.abs(pad?.axes[0] ?? 0) > .18 ? pad!.axes[0] : 0;
    const vertical = Math.abs(pad?.axes[1] ?? 0) > .18 ? pad!.axes[1] : 0;
    if (!editing && pad && (axis || vertical || pad.buttons.some(b => b.pressed))) inputType = "gamepad";
    const input: Input = {
      steer: editing ? 0 : Number(keys.has("KeyD") || keys.has("ArrowRight") || touches.has("right")) - Number(keys.has("KeyA") || keys.has("ArrowLeft") || touches.has("left")) + axis + Number(Boolean(pad?.buttons[15]?.pressed)) - Number(Boolean(pad?.buttons[14]?.pressed)),
      jump: !editing && (keys.has("Space") || a || touches.has("jump")),
      boost: !editing && (keys.has("KeyW") || keys.has("ArrowUp") || keys.has("ShiftLeft") || Boolean(pad?.buttons[1]?.pressed) || Boolean(pad?.buttons[12]?.pressed) || vertical < -.5 || touches.has("boost")),
      slow: !editing && (keys.has("KeyS") || keys.has("ArrowDown") || Boolean(pad?.buttons[13]?.pressed) || vertical > .5),
    };
    if (!paused) {
      accumulator += dt;
      while (accumulator >= STEP) {
        const events = stepRun(state, input); accumulator -= STEP;
        events.forEach(event => {
          audio.play(event);
          if (event === "hit") cameraSnap = true;
          if (event === "finish") { onFinish({ timeMs: Math.round(state.time * 1000), input: inputType, coins: state.coins, runId }); publish(); }
        });
      }
    } else accumulator = 0;
    const f = frameAt(state.s);
    runner.root.position.copy(f.position).addScaledVector(f.right, state.x).addScaledVector(f.up, state.y);
    runner.root.quaternion.copy(f.quaternion);
    runner.root.visible = state.phase !== "respawning" || Math.sin(now / 55) > 0;
    runner.animate(state.time, state.phase === "running" && !paused, !state.grounded, input.steer, state.speed);
    shadow.position.copy(world(state.s, state.x, .035)); shadow.visible = state.y >= 0; shadow.scale.setScalar(Math.max(.3, 1 - state.y * .1));
    obstacles.forEach((o, i) => { if (OBSTACLES[i].moving) o.position.copy(world(OBSTACLES[i].s, obstacleX(OBSTACLES[i], state.time))); });
    diamonds.forEach((diamond, i) => { diamond.visible = !state.collected.has(i) && (!software || Math.abs(ITEMS[i].s - state.s) < 100); diamond.rotation.y = state.time * 2 + i; });
    softwareBuildings.forEach(b => { b.visible = b.userData.s > state.s - 25 && b.userData.s < state.s + 100; });
    gates.forEach((gate, i) => { gate.scale.setScalar(i < state.checkpoint ? 1.025 : 1); });
    cameraTarget.copy(world(state.s - 10, state.x * .32, 5.2));
    lookTarget.copy(world(state.s + 15, state.x * .15, 1.5));
    if (cameraSnap) { camera.position.copy(cameraTarget); smoothLook.copy(lookTarget); cameraSnap = false; }
    camera.position.lerp(cameraTarget, 1 - Math.exp(-8 * dt)); smoothLook.lerp(lookTarget, 1 - Math.exp(-7 * dt)); camera.lookAt(smoothLook);
    const fov = state.boost > 0 ? 71 : state.speed > 14 ? 68 : 64;
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    if (now - hudAt > 90) { publish(); hudAt = now; }
  };
  frame = requestAnimationFrame(animate);
  return {
    start, mute: value => audio.mute(value),
    pause(value) { paused = value; clear(); publish(); },
    touch(key, down) { if (down) { touches.add(key); inputType = "touch"; audio.unlock(); } else touches.delete(key); },
    dispose() {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect(); audio.dispose();
      window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", visibility);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m)); } });
      if (software) { geometries.add(windows.geometry); materials.add(windows.material as THREE.Material); }
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      buildings.dispose(); windows.dispose(); if (renderer instanceof THREE.WebGLRenderer) renderer.dispose(); renderer.domElement.remove();
    },
  };
}
