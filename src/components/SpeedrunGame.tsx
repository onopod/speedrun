"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { createAutorunScene, type GameHandle, type Hud, type RunResult } from "@/lib/autorun-scene";
import { COURSES, findCourse, type Course, RUN_SPEED, finishGrade } from "@/lib/autorun";
import { normalizeGuestName } from "@/lib/guest-rules";
import { localPlayer, rememberPlayer, queuedRuns, queueRun, removeQueuedRun } from "@/lib/local-player";

import CourseSelect, { Difficulty } from "./CourseSelect";
import type { RunnerVariant } from "@/lib/runner-model";

type Guest = { id: string; name: string };
type Score = { id: string; name: string; timeMs: number; coins: number; playerId: string };
const initialHud: Hud = { phase: "ready", time: 0, distance: 0, checkpoint: 0, coins: 0, deaths: 0, speed: RUN_SPEED, boost: false, height: 0, jumpLevel: 0, gamepad: false, input: "keyboard", paused: false, software: false, finishTime: 0, slope: 0, nextJump: 60, speedMode: "normal" };
const formatTime = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${(ms % 60000 / 1000).toFixed(2).padStart(5, "0")}`;
const finishCopy = { great: { title: "最高の走り！", label: "EXCELLENT", action: "両手を上げてビクトリージャンプ" }, good: { title: "ナイスラン！", label: "NICE RUN", action: "笑顔で手を振ってフィニッシュ" }, retry: { title: "次はもっといける！", label: "KEEP GOING", action: "照れながら頭をかいて、うなずく" } };
function RunnerPortrait({ female }: { female: boolean }) {
  const accent = female ? "#63f6ed" : "#a0ff54", hair = female ? "#633a58" : "#19261d";
  return <svg viewBox="0 0 120 110" aria-hidden="true"><circle cx="60" cy="52" r="46" fill={accent} opacity=".09" />{female && <path d="M83 36Q117 42 94 94L78 75Z" fill={hair} />}<path d="M22 110L27 86Q60 64 93 86L99 110" fill={female ? "#304059" : "#243429"} /><path d="M41 86L60 100L79 86" fill="none" stroke={accent} strokeWidth="8" /><ellipse cx="60" cy="49" rx="27" ry="31" fill="#efbc8b" /><path d={female ? "M32 47Q24 6 63 12Q96 12 89 48L76 27L44 35Z" : "M31 48L29 23L40 26L42 10L57 18L70 8L82 22L96 19L89 48L76 32L44 34Z"} fill={hair} />{female && <path d="M38 31L82 26" stroke={accent} strokeWidth="5" />}<circle cx="49" cy="51" r="4" fill="#14261c" /><circle cx="71" cy="51" r="4" fill="#14261c" /><path d="M51 66Q60 73 69 66" fill="none" stroke="#9f5b45" strokeWidth="3" strokeLinecap="round" /></svg>;
}
let guestRequest: Promise<Guest> | undefined;
function getGuest() {
  // Deduplicate mount/StrictMode/save requests so guest cookies cannot race.
  guestRequest ??= fetch("/api/player", { cache: "no-store" }).then(async response => {
    if (!response.ok) { const info = await response.json().catch(() => ({})); console.warn("player.service", response.status, info.code ?? "REQUEST_FAILED"); throw new Error("名前の取得に失敗しました。接続を確認して再試行してください。"); }
    let player = await response.json() as Guest;
    const local = localPlayer();
    if (local.needsSync) {
      const renamed = await fetch("/api/player", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: local.name }) });
      if (!renamed.ok) throw new Error("名前の同期を待っています。");
      player = await renamed.json();
    }
    rememberPlayer(player, false); return player;
  }).catch(error => { guestRequest = undefined; throw error; });
  return guestRequest;
}

export default function SpeedrunGame() {
  const mount = useRef<HTMLDivElement>(null), game = useRef<GameHandle | null>(null);
  const pending = useRef<RunResult | null>(null), savingIds = useRef(new Set<string>()), alive = useRef(false);
  const pauseBeforeEdit = useRef(false);
  const settings = useRef<{ loaded: boolean; character: RunnerVariant; guide: boolean; muted: boolean }>({ loaded: false, character: "hayate", guide: true, muted: false });
  const swipe = useRef<{ id: number; x: number } | null>(null);
  const [character, setCharacter] = useState<RunnerVariant>("hayate"), [showGuide, setShowGuide] = useState(true);
  const [course, setCourse] = useState<Course>(COURSES[0]);
  const selectedCourse = useRef(COURSES[0]);
  const scoreRequest = useRef(0);
  const [cleared, setCleared] = useState<Record<string, number>>({});
  const [sceneReady, setSceneReady] = useState(false);
  const COURSE_LENGTH = course.length;
  const [hud, setHud] = useState(initialHud);
  const [guest, setGuest] = useState<Guest | null>(null), [guestError, setGuestError] = useState("");
  const [connectionNotice, setConnectionNotice] = useState("");
  const [scores, setScores] = useState<Score[]>([]), [scoresStatus, setScoresStatus] = useState("ランキングを読み込み中…");
  const [muted, setMuted] = useState(false), [renderError, setRenderError] = useState("");
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(""), [nameSaving, setNameSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  useEffect(() => { if (hud.phase !== "running" || hud.paused || editing) swipe.current = null; }, [hud.phase, hud.paused, editing]);
  const loadScores = useCallback(async () => {
    const requestedCourse = selectedCourse.current.id, requestId = ++scoreRequest.current;
    try {
      const response = await fetch(`/api/leaderboard?course=${encodeURIComponent(requestedCourse)}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const rows = await response.json();
      if (alive.current && requestId === scoreRequest.current && requestedCourse === selectedCourse.current.id) { setScores(rows); setScoresStatus("一番乗りを目指そう。"); }
    } catch { if (alive.current && requestId === scoreRequest.current && requestedCourse === selectedCourse.current.id) setScoresStatus("ランキングは現在接続できません。"); }
  }, []);
  const loadGuest = useCallback(async () => {
    try { const player = await getGuest(); if (alive.current) { setGuest(player); setGuestError(""); setConnectionNotice(""); } return player; }
    catch { if (alive.current) { setGuest(localPlayer()); setConnectionNotice("ランキング接続待ち。名前はこの端末で利用できます。"); } return null; }
  }, []);
  const save = useCallback(async (run: RunResult) => {
    if (savingIds.current.has(run.runId)) return;
    savingIds.current.add(run.runId);
    if (alive.current && pending.current?.runId === run.runId) { setSaveStatus("saving"); setSaveError(""); }
    try {
      const player = await getGuest();
      if (alive.current) setGuest(player);
      const response = await fetch("/api/leaderboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(run) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) guestRequest = undefined;
        throw new Error(data.error || "保存できませんでした。再送信してください。");
      }
      removeQueuedRun(run.runId);
      if (alive.current && pending.current?.runId === run.runId) { setSaveStatus("saved"); pending.current = null; }
      await loadScores();
    } catch (error) {
      const retained = queueRun(run);
      if (alive.current && pending.current?.runId === run.runId) { setSaveStatus("error"); setSaveError(retained ? "記録をこの端末に保存しました。ランキングへの送信は接続待ちです。" : error instanceof Error ? error.message : "通信エラーです。"); }
    } finally { savingIds.current.delete(run.runId); }
  }, [loadScores]);
  useEffect(() => {
    alive.current = true;
    setGuest(localPlayer());
    void loadGuest(); void loadScores();
    const retryQueue = async () => { for (const run of queuedRuns()) await save(run); };
    void retryQueue();
    try {
      const saved = JSON.parse(localStorage.getItem("skyrush.clears.v1") ?? "{}");
      if (saved && typeof saved === "object") setCleared(Object.fromEntries(Object.entries(saved).filter(([id, time]) => findCourse(id) && typeof time === "number" && Number.isFinite(time) && time >= 25000)) as Record<string, number>);
    } catch { /* Clearing a course also works without storage. */ }
    const online = () => { void loadGuest(); void loadScores(); void retryQueue(); if (pending.current) void save(pending.current); };
    window.addEventListener("online", online);
    return () => { alive.current = false; window.removeEventListener("online", online); };
  }, [loadGuest, loadScores, save]);
  useEffect(() => {
    setSceneReady(false); setRenderError(""); setHud(initialHud);
    if (mount.current) {
      try {
        game.current = createAutorunScene(mount.current, setHud, run => {
          pending.current = run; queueRun(run); setResult(run); void save(run);
          setCleared(previous => {
            const next = { ...previous, [run.course]: Math.min(previous[run.course] ?? Infinity, run.timeMs) };
            try { localStorage.setItem("skyrush.clears.v1", JSON.stringify(next)); } catch { /* Keep the session best. */ }
            return next;
          });
        }, () => { pending.current = null; setResult(null); setSaveStatus("idle"); setSaveError(""); }, course);
        setSceneReady(true);
        if (!settings.current.loaded) {
          settings.current.loaded = true;
          try {
            const saved = JSON.parse(localStorage.getItem("skyrush.settings.v1") ?? "{}");
            settings.current = { loaded: true, character: saved.character === "hikari" ? "hikari" : "hayate", guide: saved.guide !== false, muted: saved.muted === true };
          } catch { /* Defaults still work when device storage is unavailable. */ }
        }
        const preference = settings.current;
        setCharacter(preference.character); setShowGuide(preference.guide); setMuted(preference.muted);
        game.current.configure(preference.character, preference.guide); game.current.mute(preference.muted);
      } catch { setRenderError("3D画面を起動できません。ブラウザのハードウェアアクセラレーションを確認してください。"); }
    }
    return () => { game.current?.dispose(); game.current = null; };
  }, [course, save]);
  const selectCourse = (next: Course) => {
    if (next.id === selectedCourse.current.id) return;
    game.current?.pause(true); selectedCourse.current = next; setCourse(next);
    pending.current = null; setResult(null); setSceneReady(false); setHud(initialHud); setScores([]); setScoresStatus("ランキングを読み込み中…"); void loadScores();
  };
  const chooseStage = () => { game.current?.ready(); };
  const configure = (variant = character, guide = showGuide, mute = muted) => {
    settings.current = { loaded: true, character: variant, guide, muted: mute };
    setCharacter(variant); setShowGuide(guide); setMuted(mute); game.current?.configure(variant, guide); game.current?.mute(mute);
    try { localStorage.setItem("skyrush.settings.v1", JSON.stringify({ character: variant, guide, muted: mute })); } catch { /* Session settings remain usable. */ }
  };
  const grade = result ? finishGrade(result.coins, result.deaths) : "good", reaction = finishCopy[grade];
  const start = () => { game.current?.start(); };
  const editName = () => { pauseBeforeEdit.current = hud.paused; game.current?.pause(true); setDraft(guest?.name ?? ""); setGuestError(""); setEditing(true); };
  const closeEditor = () => { setEditing(false); game.current?.pause(pauseBeforeEdit.current); };
  const updateName = async (event: FormEvent) => {
    event.preventDefault(); const name = normalizeGuestName(draft);
    if (!name) { setGuestError("名前は3〜6文字。文字・数字・ー・_・- が使えます。"); return; }
    setNameSaving(true);
    try {
      await getGuest();
      const response = await fetch("/api/player", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await response.json();
      if (!response.ok) { if (response.status === 401) guestRequest = undefined; throw new Error(data.error); }
      guestRequest = Promise.resolve(data); rememberPlayer(data, false); setGuest(data); setGuestError(""); setConnectionNotice(""); closeEditor(); void loadScores();
    } catch {
      const local = { ...localPlayer(), name };
      const retained = rememberPlayer(local, true); guestRequest = undefined;
      setGuest(local); setGuestError(""); setConnectionNotice(retained ? "名前をこの端末に保存しました。ランキングとの同期は接続待ちです。" : "名前を一時変更しました。この端末では保存できません。"); closeEditor();
    }
    finally { setNameSaving(false); }
  };
  const rankList = <div className="ranking"><h2>WORLD TOP 10 <small>{course.name} / 自己ベスト</small></h2><ol>{scores.length ? scores.map(score => <li key={score.id} className={score.playerId === guest?.id ? "my-score" : ""}><span>{score.name}{score.playerId === guest?.id && <small> YOU</small>}</span><b>{formatTime(score.timeMs)}</b></li>) : <li className="empty">{scoresStatus}</li>}</ol></div>;
  const touchButton = (key: "jump" | "boost" | "slow", label: string, text: string) => <button className={`touch-${key}`} aria-label={label} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); game.current?.touch(key, true); }} onPointerUp={e => { game.current?.touch(key, false); e.currentTarget.blur(); }} onPointerCancel={() => game.current?.touch(key, false)} onLostPointerCapture={() => game.current?.touch(key, false)}>{text}</button>;
  const slide = (e: PointerEvent<HTMLDivElement>) => {
    if (swipe.current?.id !== e.pointerId) return;
    const width = e.currentTarget.clientWidth;
    if (width > 0) game.current?.slide((e.clientX - swipe.current.x) / (width * .65));
    swipe.current.x = e.clientX;
  };

  return <section className={`game-shell speed-${hud.speedMode} ${hud.boost ? "boosting" : ""}`}>
    <div ref={mount} className="scene-mount" />
    {hud.phase === "running" && !editing && !hud.paused && <div className="swipe-surface" role="region" aria-label="左右スワイプ操作エリア"
      onPointerDown={e => { if (e.button !== 0 || swipe.current) return; e.preventDefault(); swipe.current = { id: e.pointerId, x: e.clientX }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={slide} onPointerUp={e => { slide(e); if (swipe.current?.id === e.pointerId) swipe.current = null; }}
      onPointerCancel={e => { if (swipe.current?.id === e.pointerId) swipe.current = null; }} onLostPointerCapture={e => { if (swipe.current?.id === e.pointerId) swipe.current = null; }} />}
    {hud.phase === "running" && !hud.paused && !editing && ["manual", "star", "pad"].includes(hud.speedMode) && <div className="speed-fx" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ left: `${i < 6 ? 2 + i * 2.8 : 84 + (i - 6) * 2.8}%`, top: `${13 + (i * 17 % 63)}%`, animationDelay: `${-(i * .073)}s`, height: `${36 + i % 4 * 15}px` }} />)}</div>}
    <header className="hud">
      <div className="brand">SKY <b>RUSH</b><small>{course.name} / {course.subtitle}</small></div>
      <div className="timer">{formatTime(hud.time)}<small>{hud.speedMode === "star" ? "STAR BOOST!" : hud.speedMode === "pad" ? "PAD BOOST!" : hud.speedMode === "manual" ? "ACCEL!" : hud.phase === "running" ? "AUTO RUN" : "TIME ATTACK"}</small></div>
      <div className="status"><span className={hud.gamepad ? "online" : ""}>{hud.gamepad ? "● GAMEPAD" : "● NO LOGIN"}</span><span>★ {hud.coins} <i>/ 60</i></span></div>
    </header>
    <div className="player-badge"><small>YOUR RUNNER</small><button onClick={editName} aria-label="プレイヤー名を変更">{guest?.name ?? "ゲスト"} <span>✎</span></button></div>
    <div className="utility"><button onClick={e => { configure(character, showGuide, !muted); e.currentTarget.blur(); }} aria-label={muted ? "音をオン" : "音をミュート"}>{muted ? "♪ OFF" : "♪ ON"}</button><button onClick={e => { game.current?.pause(!hud.paused); e.currentTarget.blur(); }} aria-label={hud.paused ? "設定を閉じる" : hud.phase === "running" || hud.phase === "respawning" ? "一時停止" : "設定"}>{hud.paused ? "✕" : "Ⅱ 設定"}</button></div>
    <div className="checkpoint"><p>CHECKPOINT <b>{hud.checkpoint}</b> / {course.checkpoints.length} <span>{Math.floor(hud.distance)} / {COURSE_LENGTH} m</span></p><div className="progress"><i style={{ width: `${hud.distance / COURSE_LENGTH * 100}%` }} />{course.checkpoints.map(s => s / course.length * 100).map(p => <em key={p} style={{ left: `${p}%` }} />)}</div><small>{Math.round(hud.speed * 3.6)} km/h · {hud.slope < -.04 ? "▼ DOWNHILL" : hud.slope > .04 ? "▲ UPHILL" : "FLAT"} · RETRY {hud.deaths} · JUMP {Math.max(0, hud.height).toFixed(1)} m {hud.jumpLevel > 0 && `［${["", "小", "中", "大"][hud.jumpLevel]}］`}</small></div>
    <div className="controls"><span>A D / ← → 左右</span><span>SPACE 長押しで大ジャンプ</span><span>W / S 押している間だけ加減速</span><span>R 最初から</span></div>
    {(hud.phase === "running" || hud.phase === "respawning") && !editing && !hud.paused && <div className="touch-controls"><div className="speed-buttons">{touchButton("boost", "前：押している間だけ加速", "▲ 前")}{touchButton("slow", "後ろ：押している間だけ減速", "▼ 後ろ")}</div><div>{touchButton("jump", "ジャンプ：タップで小、長押しで大", "JUMP")}<small>長押しで大</small></div></div>}
    {hud.phase === "running" && !editing && !hud.paused && hud.time < 6500 && <div className="swipe-guide" role="status"><span className="swipe-arrow left" aria-hidden="true">‹‹</span><div><span className="swipe-hand" aria-hidden="true">☝</span><b>左右にスワイプ</b><small>指をすべらせて移動</small></div><span className="swipe-arrow right" aria-hidden="true">››</span></div>}
    {hud.phase === "respawning" && !editing && <div className="respawn-notice" role="status"><b>もう一度、ここから。</b><span>{hud.checkpoint ? `CHECKPOINT ${hud.checkpoint}` : "START"} から自動で再開</span></div>}
    {showGuide && hud.phase === "running" && !hud.paused && !editing && <div className={`route-hint ${hud.nextJump < 2 && hud.nextJump > -1 ? "jump-now" : ""}`} aria-label="回収ルートガイド"><span>◇ STAR LINE</span><b>{hud.nextJump < 2 && hud.nextJump > -1 ? "ここで長押しジャンプ！" : hud.nextJump < 25 ? `大ジャンプまで ${Math.max(0, Math.round(hud.nextJump))} m` : "水色のラインで全スターを目指そう"}</b><small>通常速度・大ジャンプの回収ルート</small></div>}
    {hud.paused && !editing && <div className="overlay settings-overlay"><div className="card settings-card" role="dialog" aria-modal="true" aria-labelledby="settings-title" onKeyDown={e => {
      if (e.key === "Escape") { e.stopPropagation(); game.current?.pause(false); }
      if (e.key === "Tab") { const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button,input,a[href]')); const first = controls[0], last = controls.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    }}>
      <div className="eyebrow">TAKE A BREATHER</div><h2 id="settings-title">{hud.phase === "running" || hud.phase === "respawning" ? "ひとやすみ。" : "ランの設定"}</h2><p className="settings-lead">キャラクターとガイドを選ぼう。<br />走行中の時間・位置・スターはそのまま。</p>
      <div className="character-options" role="group" aria-label="キャラクターを選ぶ">{(["hayate", "hikari"] as const).map(variant => <button key={variant} autoFocus={variant === "hayate"} aria-pressed={character === variant} onClick={() => configure(variant)} className={variant === "hikari" ? "hikari" : "hayate"}><RunnerPortrait female={variant === "hikari"} /><b>{variant === "hikari" ? "ヒカリ" : "ハヤテ"}</b><small>{variant === "hikari" ? "軽やかなポニーテール" : "風を切るランナー"}</small><span>{character === variant ? "✓ 選択中" : "選ぶ"}</span></button>)}</div>
      <label className="setting-switch"><span><b>全スター回収ルート</b><small>半透明のラインとジャンプの目印</small></span><input type="checkbox" checked={showGuide} onChange={e => configure(character, e.target.checked)} /></label>
      <label className="setting-switch"><span><b>BGM・効果音</b><small>ジャンプもスターも音で楽しむ</small></span><input type="checkbox" checked={!muted} onChange={e => configure(character, showGuide, !e.target.checked)} /></label>
      <p className="fineprint">ラインは前後ボタンを離した通常速度で、青い加速スターも取る想定。矢印の先端で長押しジャンプ。キャラによる性能差はありません。</p>
      <a className="fx-credit" href="/effects" target="_blank" rel="noopener noreferrer">7つのエフェクトを見比べる ↗</a>
      <button className="secondary" onClick={chooseStage}>ステージセレクトへ（走行を終了）</button>
      <button className="primary" onClick={() => game.current?.pause(false)}>{hud.phase === "running" || hud.phase === "respawning" ? "▶ 走行を再開" : "設定を閉じる"}</button>
    </div></div>}
    {hud.phase === "ready" && !editing && !hud.paused && <div className="overlay intro stage-intro"><div className="card stage-card">
      <div className="stage-heading"><div><div className="eyebrow">SKY RUSH / STAGE SELECT</div><h1>次は、どこを走る？</h1></div><span>8 COURSES<br /><small>すべてプレイ可能</small></span></div>
      <CourseSelect selected={course.id} onSelect={selectCourse} cleared={cleared} />
      <div className="selected-course"><div><b>{course.name}</b><Difficulty level={course.difficulty} /><span>{course.length} m · スター60個 · チェックポイント3か所</span></div><p>{course.description}</p>{cleared[course.id] && <small>この端末の自己ベスト {formatTime(cleared[course.id])}</small>}</div>
      <div className="stage-start"><button className="primary" disabled={!sceneReady || Boolean(renderError)} onClick={e => { start(); e.currentTarget.blur(); }}>ゲーム開始 <span>Space ↵</span></button></div>
      <details><summary>操作方法</summary><div className="howto"><div><b>01 / STEER</b><span className="desktop-instruction">A D ・ 左スティック</span><span className="mobile-instruction">← 左右にスワイプ →</span></div><div><b>02 / JUMP</b><span className="desktop-instruction">SPACE ・ A / ×</span><span className="mobile-instruction">JUMP ボタン</span><small>タップで小・少し押して中・長押しで大</small></div><div><b>03 / SPEED</b><span className="desktop-instruction">W / S ・ スティック前後</span><span className="mobile-instruction">▲ 前 / ▼ 後ろ</span><small>押している間だけ1段階加減速</small></div><div><b>04 / COLLECT</b>緑のスター・青の加速・橙の加速板<small>水色のラインが全回収の道しるべ</small></div></div></details>
      {renderError && <p className="error" role="alert">{renderError}</p>}
      <p className="fineprint">ミスしてもチェックポイントから自動復帰。<br />名前は自動発行、記録も自動保存。ログイン不要。{hud.software && <><br />この端末ではGPUなしの簡易3D描画で動作しています。</>}</p>
      <details><summary>コントローラー・音声について</summary><p>Spaceでゲーム開始・クリア後の再挑戦。走行中はSpaceでジャンプします。Bluetoothは端末の設定でペアリング後、ボタンを押してください。Start / Menuでポーズ・再開（ゴール後は最初から）。音声は最初の画面操作後に再生します。</p><a href="/audio-credits.txt" target="_blank" rel="noopener noreferrer">音声クレジット・ライセンス</a> · <a href="/vfx/credits.txt" target="_blank" rel="noopener noreferrer">エフェクト素材のクレジット</a></details>
      {connectionNotice && <p className="fineprint" role="status">{connectionNotice} <button className="text-button" onClick={() => void loadGuest()}>再接続</button></p>}
    </div></div>}
    {hud.phase === "finished" && !editing && !hud.paused && result && hud.finishTime < 2.8 && <div className="finish-celebration" role="status"><small>{reaction.label}</small><b>{reaction.title}</b><span>★ {result.coins} / 60 · RETRY {result.deaths}</span></div>}
    {hud.phase === "finished" && !editing && !hud.paused && result && hud.finishTime >= 2.8 && <div className="overlay result-overlay"><div className="card result-card">
      <div className="eyebrow">{course.name} / {reaction.label}</div><h1 className="finish-title">{reaction.title}<span>{formatTime(result.timeMs)}</span></h1>
      <p className="reaction-label">{reaction.action}</p>
      <p className="result-summary">★ {result.coins} 個獲得 <span>RETRY {hud.deaths}</span></p>
      <div className="saved-name"><b>{guest?.name ?? "ゲスト"}</b><button className="text-button" onClick={editName}>名前を変更</button></div>
      <p className="save-status" role="status">{saveStatus === "saved" ? "✓ ランキングに保存しました" : saveStatus === "error" ? saveError : "ランキングに自動保存中…"}</p>
      {saveStatus === "error" && <button className="secondary" onClick={() => { if (pending.current) void save(pending.current); }}>記録を再送信</button>}
      <button className="primary" onClick={e => { start(); e.currentTarget.blur(); }}>もう一度走る <span>Space ↵</span></button><button className="secondary" onClick={e => { chooseStage(); e.currentTarget.blur(); }}>ステージセレクトへ</button>
      <details><summary>フィニッシュ評価について</summary><p>最高：スター48個以上・ミス2回以内。<br />ナイス：スター24個以上・ミス6回以内。<br />それ以外：次の挑戦を応援！ タイムはランキングに使います。</p></details>
      {rankList}
    </div></div>}
    {editing && <div className="overlay editor"><form className="card" role="dialog" aria-modal="true" aria-labelledby="name-title" onSubmit={updateName} onKeyDown={e => { if (e.key === "Escape" && !nameSaving) { e.stopPropagation(); closeEditor(); } if (e.key === "Tab") { const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input,button:not(:disabled)')); const first = controls[0], last = controls.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } }}>
      <div className="eyebrow">YOUR RUNNER</div><h2 id="name-title">名前を変更</h2><p className="lead">3〜6文字のお好きな名前に。<br />このブラウザで登録した記録にも反映されます。</p>
      <label htmlFor="runner-name">プレイヤー名</label><input id="runner-name" autoFocus autoComplete="off" value={draft} maxLength={12} onChange={e => setDraft(e.target.value)} />
      <p className="fineprint">ログインは不要です。Cookieを消すと新しいプレイヤーになります。</p>
      {guestError && <p className="error" role="alert">{guestError}</p>}
      <button className="primary" type="submit" disabled={nameSaving}>{nameSaving ? "保存中…" : "名前を保存"}</button><button className="secondary" type="button" disabled={nameSaving} onClick={closeEditor}>戻る</button>
    </form></div>}
  </section>;
}
