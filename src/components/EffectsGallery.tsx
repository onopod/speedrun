"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SVGRenderer } from "three/addons/renderers/SVGRenderer.js";
import { EffectsScene } from "@/lib/run-effects-scene";
import { createRunner } from "@/lib/runner-model";
import { airborneMotion, JUMP_SPEED, type FinishGrade, type SpeedMode } from "@/lib/autorun";
import type { FxAnchor } from "@/lib/run-effects";

type Demo = "run" | "manual" | "jump" | "coin" | "boost" | "pad" | "finish";
const demos: { id: Demo; label: string; description: string }[] = [
  { id: "run", label: "通常走行", description: "足元に小さな白い煙。走りを邪魔しない控えめな演出。" },
  { id: "manual", label: "前ボタンで加速", description: "靴から黄緑の光の尾。ゲームでは前ボタンを押している間だけ。" },
  { id: "jump", label: "ジャンプ", description: "踏み切りの煙、小→中→大のきらめき、着地の煙。" },
  { id: "coin", label: "緑のスター", description: "金色と黄緑のきらめきが弾け、キャラクターへ集まる。" },
  { id: "boost", label: "青のスター", description: "青白い光の粒と広がる輪。青い加速の尾が続く。" },
  { id: "pad", label: "加速板", description: "板が発光し、橙色の光と輪が広がる。" },
  { id: "finish", label: "ゴール", description: "左右から星と紙吹雪。成績に合わせたアクション。" },
];

export default function EffectsGallery() {
  const mount = useRef<HTMLDivElement>(null), player = useRef<{ play(demo: Demo, grade: FinishGrade): void } | null>(null);
  const [demo, setDemo] = useState<Demo>("run"), [grade, setGrade] = useState<FinishGrade>("great"), [software, setSoftware] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const element = mount.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer | SVGRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.outputColorSpace = THREE.SRGBColorSpace; }
    catch { renderer = new SVGRenderer(); renderer.setQuality("low"); setSoftware(true); }
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x061411);
    const camera = new THREE.PerspectiveCamera(53, 1, .1, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x324638, 3)); const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(2, 8, 5); scene.add(light);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(16, 13, 8, 8), new THREE.MeshBasicMaterial({ color: 0x172c25 })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const grid = new THREE.GridHelper(14, 14, 0x4c7860, 0x244534); grid.position.y = .01; scene.add(grid);
    const runner = createRunner("hikari"); scene.add(runner.root);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2, .08, 3), new THREE.MeshBasicMaterial({ color: 0xa96622 })); board.position.y = .02; board.visible = false; scene.add(board);
    const effects = new EffectsScene(renderer instanceof SVGRenderer, window.matchMedia("(prefers-reduced-motion: reduce)").matches); scene.add(effects.root);
    renderer.domElement.setAttribute("aria-label", "エフェクト見本の3Dプレビュー"); renderer.domElement.classList.add("game-canvas"); element.appendChild(renderer.domElement);
    let active: Demo = "run", result: FinishGrade = "great", elapsed = 0, last = performance.now(), frame = 0, disposed = false;
    const anchor = (y = 0): FxAnchor => ({ position: { x: 0, y, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, back: { x: 0, y: 0, z: 1 } });
    player.current = { play(kind, evaluation) {
      active = kind; result = evaluation; elapsed = 0; effects.model.clear(); board.visible = kind === "pad";
      if (kind !== "run" && kind !== "manual") effects.model.event(kind, anchor(kind === "coin" || kind === "boost" ? 1.2 : 0), evaluation);
    } };
    const resize = new ResizeObserver(() => {
      const w = element.clientWidth, h = element.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h;
      camera.position.set(3.2, 4.3, camera.aspect < 1 ? 11 : 8); camera.lookAt(0, 1.65, 0); camera.updateProjectionMatrix();
    }); resize.observe(element);
    const animate = (now: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(animate); const dt = Math.min((now - last) / 1000, .05); last = now;
      if (document.hidden) return;
      const previous = elapsed; elapsed += dt;
      const flight = active === "jump" ? airborneMotion(0, JUMP_SPEED, elapsed) : { y: 0, velocity: 0 }, y = Math.max(0, flight.y);
      if (active === "jump") {
        if (previous < .1 && elapsed >= .1) effects.model.event("jump-medium", anchor(y));
        if (previous < .25 && elapsed >= .25) effects.model.event("jump-large", anchor(y));
        if (elapsed > .25 && flight.y <= 0 && airborneMotion(0, JUMP_SPEED, previous).y > 0) effects.model.event("land", anchor());
      }
      const mode: SpeedMode = active === "manual" ? "manual" : active === "boost" && elapsed < 2.2 ? "star" : active === "pad" && elapsed < 1.2 ? "pad" : "normal";
      const running = active === "run" || mode !== "normal";
      effects.model.advance(dt, anchor(y), mode, running, y === 0, running && mode !== "normal" ? 20.8 : 15.6);
      runner.root.position.y = y; runner.root.rotation.y = active === "finish" ? Math.PI * Math.min(1, elapsed / .7) : running || active === "jump" ? 0 : Math.PI;
      camera.position.y = 4.3 + y * .7; camera.lookAt(0, 1.65 + y * .7, 0);
      if (active === "finish") runner.celebrate(elapsed, result); else runner.animate(elapsed, running, y > 0, 0, mode === "normal" ? 15.6 : 20.8);
      (board.material as THREE.MeshBasicMaterial).color.setHex(elapsed < .3 ? 0xffe2a3 : 0xa96622);
      effects.render(camera); renderer.domElement.setAttribute("data-vfx-particles", String(effects.model.count)); renderer.domElement.setAttribute("data-effect", active);
      try { renderer.render(scene, camera); } catch { setError("描画を開始できませんでした。"); disposed = true; }
    }; frame = requestAnimationFrame(animate);
    return () => {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect(); player.current = null; effects.dispose();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); } });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); if (renderer instanceof THREE.WebGLRenderer) renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  const play = (kind: Demo, evaluation = grade) => { setDemo(kind); setGrade(evaluation); player.current?.play(kind, evaluation); };
  return <section className="fx-gallery"><div ref={mount} className="fx-stage" /><a className="fx-back" href="/">← 瞬足ラン shun-soku run に戻る</a><div className="fx-caption"><b>{demos.find(d => d.id === demo)?.label}</b><span>{demos.find(d => d.id === demo)?.description}</span></div><aside className="card fx-menu"><div className="eyebrow">瞬足ラン shun-soku run / EFFECTS</div><h1>光を、まとう。</h1><p className="lead">ボタンを押すと、その演出を再生します。</p><div className="fx-buttons">{demos.map(d => <button key={d.id} className="secondary" aria-pressed={demo === d.id} onClick={() => play(d.id)}>{d.label}<span>↻</span></button>)}</div><div className="fx-grades" role="group" aria-label="ゴールの成績">{([['retry', '応援'], ['good', 'ナイス'], ['great', '最高']] as const).map(([id, label]) => <button key={id} aria-pressed={grade === id && demo === "finish"} onClick={() => play("finish", id)}>{label}</button>)}</div><p className="fineprint">{software ? "このブラウザでは簡易3D表示です。WebGLでは煙・光のテクスチャも使用します。" : "ゲームと同じ素材・エフェクト処理で表示しています。"}</p><a className="fx-credit" href="/vfx/credits.txt" target="_blank" rel="noopener noreferrer">素材・ライセンス</a>{error && <p className="error" role="alert">{error}</p>}</aside></section>;
}
