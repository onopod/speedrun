"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { canLand, hitsSweeper } from "@/lib/game-rules";

type Phase = "menu" | "running" | "finished";
type Score = { id: number; name: string; timeMs: number; input: string };

const BGM = "https://cdn.jsdelivr.net/gh/benmarz/minimum_game@main/assets/Formant_1.wav";
const SFX = {
  jump: "https://cdn.jsdelivr.net/gh/benmarz/minimum_game@main/assets/switch9.wav",
  hit: "https://cdn.jsdelivr.net/gh/benmarz/minimum_game@main/assets/trap.wav",
  finish: "https://cdn.jsdelivr.net/gh/benmarz/minimum_game@main/assets/coin-flip.wav",
};

const formatTime = (ms: number) => {
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const centis = Math.floor((ms % 1_000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
};

const floors = [
  { x: 0, z: -10, w: 12, d: 32 },
  { x: -2, z: -46, w: 11, d: 34 },
  { x: 2, z: -82, w: 10, d: 34 },
  { x: -2, z: -118, w: 9, d: 34 },
  { x: 1, z: -154, w: 8, d: 32 },
  { x: 0, z: -185, w: 11, d: 28 },
];

export default function SpeedrunGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("menu");
  const restartRef = useRef<() => void>(() => undefined);
  const startRef = useRef<() => void>(() => undefined);
  const mutedRef = useRef(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [elapsed, setElapsed] = useState(0);
  const [checkpoint, setCheckpoint] = useState(0);
  const [gamepad, setGamepad] = useState(false);
  const [muted, setMuted] = useState(false);
  const [inputType, setInputType] = useState<"keyboard" | "gamepad">("keyboard");
  const [scores, setScores] = useState<Score[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const runIdRef = useRef(0);
  const [scoreError, setScoreError] = useState("");
  const [scoresStatus, setScoresStatus] = useState("記録を読み込み中…");
  const [renderError, setRenderError] = useState("");

  const loadScores = useCallback(async () => {
    try {
      const response = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      setScores(await response.json());
      setScoresStatus("まだ記録がありません。");
    } catch { setScoresStatus("ランキングに接続できません。後でもう一度お試しください。"); }
  }, []);

  useEffect(() => { void loadScores(); }, [loadScores]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    mutedRef.current = muted;
    if (musicRef.current) {
      musicRef.current.volume = muted ? 0 : .22;
      if (!muted && phaseRef.current === "running") void musicRef.current.play().catch(() => undefined);
    }
  }, [muted]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020403);
    scene.fog = new THREE.FogExp2(0x061009, 0.012);
    const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 600);
    camera.position.set(0, 6, 13);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setRenderError("WebGLを初期化できません。ブラウザのハードウェアアクセラレーションを確認してください。");
      return;
    }
    let disposed = false;
    let runnerTexture: THREE.Texture | undefined;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "game-canvas";
    renderer.domElement.setAttribute("aria-label", "NEON SPRINT OSAKA WebGL game");
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xaaffc8, 0x09100c, 2.1));
    const sun = new THREE.DirectionalLight(0xffffff, 2.8);
    sun.position.set(-12, 24, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    const grid = new THREE.GridHelper(500, 100, 0x31543d, 0x102218);
    grid.position.y = -1;
    scene.add(grid);

    const platformMat = new THREE.MeshStandardMaterial({ color: 0x111713, roughness: 0.72, metalness: 0.28 });
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x76ff17, emissive: 0x2d8b08, emissiveIntensity: 2 });
    floors.forEach((floor) => {
      const platform = new THREE.Mesh(new THREE.BoxGeometry(floor.w, 1, floor.d), platformMat);
      platform.position.set(floor.x, -0.5, floor.z);
      platform.receiveShadow = true;
      scene.add(platform);
      [-1, 1].forEach((side) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(.09, .12, floor.d), edgeMat);
        rail.position.set(floor.x + side * floor.w / 2, .08, floor.z);
        scene.add(rail);
      });
    });

    // Osaka-inspired skyline: procedural buildings plus a tall landmark tower.
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x09120d, emissive: 0x07140a, roughness: .9 });
    const windowMat = new THREE.MeshBasicMaterial({ color: 0x62db38 });
    for (let i = 0; i < 72; i++) {
      const side = i % 2 ? -1 : 1;
      const h = 5 + ((i * 13) % 19);
      const box = new THREE.Mesh(new THREE.BoxGeometry(3 + (i % 4), h, 3 + ((i + 2) % 5)), buildingMat);
      box.position.set(side * (12 + (i % 5) * 4), h / 2 - 1, 8 - i * 3.3);
      scene.add(box);
      for (let y = 2; y < h - 1; y += 3) {
        const light = new THREE.Mesh(new THREE.PlaneGeometry(.5, .22), windowMat);
        light.position.set(box.position.x - side * (box.geometry.parameters.width / 2 + .01), y, box.position.z);
        light.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        scene.add(light);
      }
    }
    const tower = new THREE.Mesh(new THREE.BoxGeometry(5, 48, 5), buildingMat);
    tower.position.set(-24, 23, -142);
    scene.add(tower);
    const towerTop = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 4), edgeMat);
    towerTop.position.set(-24, 50.5, -142);
    towerTop.rotation.y = Math.PI / 4;
    scene.add(towerTop);

    const player = new THREE.Group();
    player.position.set(0, 1.2, 5);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .52, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.15;
    player.add(shadow);
    new THREE.TextureLoader().load("/runner.webp", (texture) => {
      if (disposed) { texture.dispose(); return; }
      runnerTexture = texture;
      texture.colorSpace = THREE.SRGBColorSpace;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
      sprite.scale.set(3.35, 3.35, 1);
      sprite.position.y = .35;
      player.add(sprite);
    });
    scene.add(player);

    const checkpoints = [-55, -110, -160];
    checkpoints.forEach((z, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, .16, 12, 48), edgeMat.clone());
      ring.position.set(index === 2 ? 1 : -2, 3.25, z);
      ring.userData.checkpoint = index + 1;
      scene.add(ring);
    });

    const sweepers: THREE.Group[] = [];
    [-43, -92, -146].forEach((z, i) => {
      const group = new THREE.Group();
      group.position.set(floors[i + 1].x, 1, z);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.45, .55, 2, 16), edgeMat);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(9 - i, .55, .55), new THREE.MeshStandardMaterial({ color: 0xff3d64, emissive: 0xb00028 }));
      bar.position.y = .5;
      group.add(hub, bar);
      group.userData.speed = .9 + i * .22;
      group.userData.width = 9 - i;
      scene.add(group);
      sweepers.push(group);
    });

    const movers: THREE.Mesh[] = [];
    [-74, -122].forEach((z, i) => {
      const mover = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.2), new THREE.MeshStandardMaterial({ color: 0xffb21a, emissive: 0x8d4f00 }));
      mover.position.set(0, 1.3, z);
      mover.userData.baseZ = z;
      mover.userData.phase = i * Math.PI;
      mover.castShadow = true;
      scene.add(mover);
      movers.push(mover);
    });

    const goal = new THREE.Group();
    goal.position.set(0, 0, -194);
    [-4.8, 4.8].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.35, 7, .35), edgeMat);
      post.position.set(x, 3.5, 0);
      goal.add(post);
    });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(10, .55, .28), edgeMat);
    banner.position.y = 6.8;
    goal.add(banner);
    scene.add(goal);

    const particlesGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(750 * 3);
    for (let i = 0; i < particlePositions.length; i += 3) {
      particlePositions[i] = (Math.random() - .5) * 90;
      particlePositions[i + 1] = Math.random() * 45;
      particlePositions[i + 2] = 20 - Math.random() * 250;
    }
    particlesGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
    scene.add(new THREE.Points(particlesGeometry, new THREE.PointsMaterial({ color: 0x7dff4c, size: .07, transparent: true, opacity: .65 })));

    const music = new Audio(BGM);
    music.loop = true;
    music.volume = .22;
    musicRef.current = music;
    const sounds = Object.fromEntries(Object.entries(SFX).map(([key, src]) => {
      const audio = new Audio(src); audio.volume = key === "hit" ? .28 : .42; return [key, audio];
    })) as Record<keyof typeof SFX, HTMLAudioElement>;
    const play = (name: keyof typeof SFX) => {
      if (mutedRef.current) return;
      sounds[name].currentTime = 0;
      void sounds[name].play().catch(() => undefined);
    };

    const keys = new Set<string>();
    let velocityY = 0;
    let grounded = true;
    let currentCheckpoint = 0;
    let startedAt = 0;
    let finalTime = 0;
    let lastPadA = false;
    let lastPadStart = false;
    let lastFrame = performance.now();
    let uiTick = 0;
    let usedGamepad = false;

    const resetPosition = (hit = false) => {
      const starts = [{ x: 0, z: 5 }, { x: -2, z: -57 }, { x: 2, z: -112 }, { x: 1, z: -162 }];
      player.position.set(starts[currentCheckpoint].x, 1.2, starts[currentCheckpoint].z);
      velocityY = 0;
      grounded = true;
      if (hit) play("hit");
    };

    const startGame = () => {
      runIdRef.current += 1;
      usedGamepad = false;
      setInputType("keyboard");
      setScoreError("");
      currentCheckpoint = 0;
      setCheckpoint(0);
      setElapsed(0);
      setSaved(false);
      resetPosition();
      startedAt = performance.now();
      phaseRef.current = "running";
      setPhase("running");
      if (!mutedRef.current) void music.play().catch(() => undefined);
    };
    startRef.current = startGame;
    restartRef.current = startGame;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, button, [contenteditable='true']")) return;
      keys.add(event.code);
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
      if (event.code === "KeyR" && !event.repeat) startGame();
      if ((event.code === "Enter" || event.code === "Space") && phaseRef.current === "menu") startGame();
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const clearKeys = () => keys.clear();
    const onPad = () => setGamepad(Boolean(navigator.getGamepads?.().find(Boolean)));
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", clearKeys);
    window.addEventListener("gamepadconnected", onPad);
    window.addEventListener("gamepaddisconnected", onPad);
    onPad();

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const targetCamera = new THREE.Vector3();
    let frame = 0;
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min((now - lastFrame) / 1000, .04);
      lastFrame = now;
      const t = phaseRef.current === "running" ? (now - startedAt) / 1000 : 0;
      sweepers.forEach((s) => { s.rotation.y = t * s.userData.speed; });
      movers.forEach((m) => { m.position.x = Math.sin(t * 1.4 + m.userData.phase) * 3.4; });

      const pad = navigator.getGamepads?.().find(Boolean);
      const padA = Boolean(pad?.buttons[0]?.pressed);
      const padStart = Boolean(pad?.buttons[9]?.pressed);
      if (padA && !lastPadA && phaseRef.current === "menu") startGame();
      if (padStart && !lastPadStart) startGame();
      lastPadA = padA;
      lastPadStart = padStart;

      if (phaseRef.current === "running") {
        let x = 0, z = 0;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
        if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
        if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
        if (pad) {
          const dead = (value: number) => Math.abs(value) > .16 ? value : 0;
          const px = dead(pad.axes[0] ?? 0), pz = dead(pad.axes[1] ?? 0);
          x += px; z += pz;
          if (!usedGamepad && (px || pz || pad?.buttons.some((button) => button.pressed))) { usedGamepad = true; setInputType("gamepad"); }
          if (pad.buttons[14]?.pressed) x -= 1;
          if (pad.buttons[15]?.pressed) x += 1;
          if (pad.buttons[12]?.pressed) z -= 1;
          if (pad.buttons[13]?.pressed) z += 1;
        }
        const length = Math.hypot(x, z) || 1;
        const speed = keys.has("ShiftLeft") || pad?.buttons[1]?.pressed ? 11.5 : 9.4;
        player.position.x += (x / Math.max(1, length)) * speed * dt;
        player.position.z += (z / Math.max(1, length)) * speed * dt;
        player.position.x = THREE.MathUtils.clamp(player.position.x, -9, 9);

        const jump = keys.has("Space") || padA;
        if (jump && grounded) { velocityY = 8.3; grounded = false; play("jump"); }
        const previousY = player.position.y;
        velocityY -= 20 * dt;
        player.position.y += velocityY * dt;
        const floor = floors.find((f) => Math.abs(player.position.x - f.x) <= f.w / 2 && Math.abs(player.position.z - f.z) <= f.d / 2);
        if (canLand(previousY, player.position.y, velocityY, Boolean(floor))) { player.position.y = 1.2; velocityY = 0; grounded = true; }
        else if (!floor) grounded = false;

        // Simple, deterministic obstacle volumes keep the course fair at any frame rate.
        const hitSweeper = sweepers.some((s) => hitsSweeper(player.position.x - s.position.x, player.position.z - s.position.z, s.rotation.y, s.userData.width, player.position.y));
        const hitMover = movers.some((m) => Math.abs(player.position.z - m.position.z) < 1.5 && Math.abs(player.position.x - m.position.x) < 1.65 && player.position.y < 3.2);
        if (hitSweeper || hitMover || player.position.y < -8 || Math.abs(player.position.x) > 8.8) resetPosition(true);

        checkpoints.forEach((checkpointZ, index) => {
          if (floor && player.position.y >= 1.2 && currentCheckpoint === index && player.position.z < checkpointZ) {
            currentCheckpoint = index + 1;
            setCheckpoint(currentCheckpoint);
          }
        });
        if (floor && player.position.y >= 1.2 && player.position.z < -193 && currentCheckpoint === 3) {
          finalTime = now - startedAt;
          setElapsed(finalTime);
          setInputType(usedGamepad ? "gamepad" : "keyboard");
          phaseRef.current = "finished";
          setPhase("finished");
          music.pause();
          play("finish");
          void loadScores();
        }
        if (phaseRef.current === "running" && now - uiTick > 30) { setElapsed(now - startedAt); uiTick = now; }
      }

      targetCamera.set(player.position.x * .45, player.position.y + 5.2, player.position.z + 11.5);
      camera.position.lerp(targetCamera, 1 - Math.pow(.002, dt));
      camera.lookAt(player.position.x * .2, player.position.y + .8, player.position.z - 7);
      player.rotation.y = Math.sin(t * 12) * (phaseRef.current === "running" ? .035 : .01);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      music.pause();
      musicRef.current = null;
      Object.values(sounds).forEach((audio) => audio.pause());
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      document.removeEventListener("visibilitychange", clearKeys);
      window.removeEventListener("gamepadconnected", onPad);
      window.removeEventListener("gamepaddisconnected", onPad);
      window.removeEventListener("resize", onResize);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Points) {
          object.geometry?.dispose();
          const material = object.material as THREE.Material | THREE.Material[];
          (Array.isArray(material) ? material : [material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      runnerTexture?.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [loadScores]);

  const submitScore = async (event: FormEvent) => {
    event.preventDefault();
    if (phaseRef.current !== "finished" || !playerName.trim() || saved || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setScoreError("");
    const runId = runIdRef.current;
    try {
      const response = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: playerName, timeMs: elapsed, input: inputType }),
      });
      if (!response.ok) throw new Error(response.status === 400 ? "名前または記録を確認してください。" : "記録を保存できませんでした。再送信してください。");
      if (runId === runIdRef.current) setSaved(true);
      await loadScores();
    } catch (error) {
      if (runId === runIdRef.current) setScoreError(error instanceof Error ? error.message : "通信エラーです。再送信してください。");
    } finally { savingRef.current = false; setSaving(false); }
  };

  return (
    <section className="game-shell">
      <div ref={mountRef} />
      <div className="hud">
        <div className="brand">NEON SPRINT <b>OSAKA</b></div>
        <div className="timer">{formatTime(elapsed)}<small>{phase === "running" ? "RUNNING" : "TIME ATTACK"}</small></div>
        <div className="status">
          <span className={gamepad ? "online" : ""}>{gamepad ? "● GAMEPAD CONNECTED" : "○ KEYBOARD"}</span>
          <span>INPUT: {inputType.toUpperCase()}</span>
        </div>
      </div>
      <button className="mute" onClick={(event) => { setMuted((value) => !value); event.currentTarget.blur(); }} aria-label={muted ? "音をオン" : "音をミュート"}>{muted ? "🔇" : "🔊"}</button>
      <div className="checkpoint"><p>CHECKPOINT {checkpoint} / 3</p><div className="progress"><i style={{ width: `${checkpoint / 3 * 100}%` }} /></div></div>
      <div className="controls"><span className="key">WASD 移動</span><span className="key">SPACE / A ジャンプ</span><span className="key">R リスタート</span></div>

      {phase === "menu" && <div className="overlay"><div className="card">
        <div className="eyebrow">WEBGL SPEEDRUN // OSAKA NIGHT</div>
        <h1>NEON <span>SPRINT</span></h1>
        <p className="lead">ネオンの障害物コースを走り抜け、3つのチェックポイントを通過して最速タイムを狙え。</p>
        <div className="howto">
          <div><b>⌨ KEYBOARD</b>WASD / 矢印で移動<br />SPACEでジャンプ</div>
          <div><b>🎮 CONTROLLER</b>左スティックで移動<br />Aボタンでジャンプ</div>
        </div>
        {renderError && <p role="alert">{renderError}</p>}
        <button className="primary" disabled={Boolean(renderError)} onClick={(event) => { startRef.current(); event.currentTarget.blur(); }}>RUN START</button>
        <p className="lead" style={{ fontSize: 12, marginBottom: 0 }}>BluetoothコントローラーはPC・スマホの設定でペアリングしてからボタンを押してください。</p>
        <a href="/audio-credits.txt" target="_blank" rel="noopener noreferrer" style={{ color: "#b8c3bb", fontSize: 12 }}>音声クレジット・ライセンス（別タブ）</a>
      </div></div>}

      {phase === "finished" && <div className="overlay"><div className="card">
        <div className="eyebrow">COURSE COMPLETE</div>
        <h1 style={{ fontSize: "clamp(34px,7vw,62px)" }}>FINISH <span>{formatTime(elapsed)}</span></h1>
        <form className="score-form" onSubmit={submitScore}>
          <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={16} placeholder="プレイヤー名" aria-label="プレイヤー名" />
          <button type="submit" disabled={saved || saving || !playerName.trim()}>{saved ? "登録済" : saving ? "送信中…" : "記録登録"}</button>
        </form>
        {scoreError && <p role="alert">{scoreError}</p>}
        <button className="primary" onClick={(event) => { restartRef.current(); event.currentTarget.blur(); }}>RETRY</button>
        <button className="secondary" onClick={() => { phaseRef.current = "menu"; setPhase("menu"); }}>メニューへ</button>
        <div className="ranking"><h2>WORLD TOP 10</h2><ol>{scores.length ? scores.map((score) => <li key={score.id}>{score.name}<span>{formatTime(score.timeMs)}</span></li>) : <li>{scoresStatus}</li>}</ol></div>
      </div></div>}
    </section>
  );
}
