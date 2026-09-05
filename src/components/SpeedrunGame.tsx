"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createAutorunScene, type GameHandle, type Hud, type RunResult } from "@/lib/autorun-scene";
import { COURSE_LENGTH } from "@/lib/autorun";
import { normalizeGuestName } from "@/lib/guest-rules";

type Guest = { id: string; name: string };
type Score = { id: string; name: string; timeMs: number; coins: number; playerId: string };
const initialHud: Hud = { phase: "ready", time: 0, distance: 0, checkpoint: 0, coins: 0, deaths: 0, speed: 12, boost: false, height: 0, gamepad: false, input: "keyboard", paused: false, software: false };
const formatTime = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${(ms % 60000 / 1000).toFixed(2).padStart(5, "0")}`;
let guestRequest: Promise<Guest> | undefined;
function getGuest() {
  // Deduplicate mount/StrictMode/save requests so guest cookies cannot race.
  guestRequest ??= fetch("/api/player", { cache: "no-store" }).then(async response => {
    if (!response.ok) { const info = await response.json().catch(() => ({})); console.warn("player.service", response.status, info.code ?? "REQUEST_FAILED"); throw new Error("名前の取得に失敗しました。接続を確認して再試行してください。"); }
    return response.json() as Promise<Guest>;
  }).catch(error => { guestRequest = undefined; throw error; });
  return guestRequest;
}

export default function SpeedrunGame() {
  const mount = useRef<HTMLDivElement>(null), game = useRef<GameHandle | null>(null);
  const pending = useRef<RunResult | null>(null), savingIds = useRef(new Set<string>()), alive = useRef(false);
  const pauseBeforeEdit = useRef(false);
  const [hud, setHud] = useState(initialHud);
  const [guest, setGuest] = useState<Guest | null>(null), [guestError, setGuestError] = useState("");
  const [scores, setScores] = useState<Score[]>([]), [scoresStatus, setScoresStatus] = useState("ランキングを読み込み中…");
  const [muted, setMuted] = useState(false), [renderError, setRenderError] = useState("");
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(""), [nameSaving, setNameSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const loadScores = useCallback(async () => {
    try {
      const response = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const rows = await response.json();
      if (alive.current) { setScores(rows); setScoresStatus("一番乗りを目指そう。"); }
    } catch { if (alive.current) setScoresStatus("ランキングは現在接続できません。"); }
  }, []);
  const loadGuest = useCallback(async () => {
    try { const player = await getGuest(); if (alive.current) { setGuest(player); setGuestError(""); } return player; }
    catch (error) { if (alive.current) setGuestError(error instanceof Error ? error.message : "名前を取得できません。"); return null; }
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
      if (alive.current && pending.current?.runId === run.runId) { setSaveStatus("saved"); pending.current = null; }
      await loadScores();
    } catch (error) {
      if (alive.current && pending.current?.runId === run.runId) { setSaveStatus("error"); setSaveError(error instanceof Error ? error.message : "通信エラーです。"); }
    } finally { savingIds.current.delete(run.runId); }
  }, [loadScores]);
  useEffect(() => {
    alive.current = true;
    void loadGuest(); void loadScores();
    if (mount.current) {
      try {
        game.current = createAutorunScene(mount.current, setHud, run => {
          pending.current = run; setResult(run); void save(run);
        }, () => { setResult(null); setSaveStatus("idle"); setSaveError(""); });
      } catch { setRenderError("3D画面を起動できません。ブラウザのハードウェアアクセラレーションを確認してください。"); }
    }
    const online = () => { void loadGuest(); void loadScores(); if (pending.current) void save(pending.current); };
    window.addEventListener("online", online);
    return () => { alive.current = false; game.current?.dispose(); game.current = null; window.removeEventListener("online", online); };
  }, [loadGuest, loadScores, save]);
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
      guestRequest = Promise.resolve(data); setGuest(data); setGuestError(""); closeEditor(); void loadScores();
    } catch (error) { setGuestError(error instanceof Error ? error.message : "変更できませんでした。"); }
    finally { setNameSaving(false); }
  };
  const rankList = <div className="ranking"><h2>WORLD TOP 10 <small>RIVER RUN / 自己ベスト</small></h2><ol>{scores.length ? scores.map(score => <li key={score.id} className={score.playerId === guest?.id ? "my-score" : ""}><span>{score.name}{score.playerId === guest?.id && <small> YOU</small>}</span><b>{formatTime(score.timeMs)}</b></li>) : <li className="empty">{scoresStatus}</li>}</ol></div>;
  const touchButton = (key: "left" | "right" | "jump" | "boost", label: string, text: string) => <button aria-label={label} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); game.current?.touch(key, true); }} onPointerUp={e => { game.current?.touch(key, false); e.currentTarget.blur(); }} onPointerCancel={() => game.current?.touch(key, false)} onLostPointerCapture={() => game.current?.touch(key, false)}>{text}</button>;

  return <section className={`game-shell ${hud.boost ? "boosting" : ""}`}>
    <div ref={mount} className="scene-mount" />
    <header className="hud">
      <div className="brand">NEON SPRINT <b>OSAKA</b><small>RIVER RUN — AUTO RUN v2</small></div>
      <div className="timer">{formatTime(hud.time)}<small>{hud.boost ? "BOOST!" : hud.phase === "running" ? "AUTO RUN" : "TIME ATTACK"}</small></div>
      <div className="status"><span className={hud.gamepad ? "online" : ""}>{hud.gamepad ? "● GAMEPAD" : "● NO LOGIN"}</span><span>◆ {hud.coins} <i>/ 60</i></span></div>
    </header>
    <div className="player-badge"><small>YOUR RUNNER</small><button onClick={editName} aria-label="プレイヤー名を変更">{guest?.name ?? "ゲスト"} <span>✎</span></button></div>
    <div className="utility"><button onClick={e => { const value = !muted; setMuted(value); game.current?.mute(value); e.currentTarget.blur(); }} aria-label={muted ? "音をオン" : "音をミュート"}>{muted ? "♪ OFF" : "♪ ON"}</button>{(hud.phase === "running" || hud.phase === "respawning") && <button onClick={e => { game.current?.pause(!hud.paused); e.currentTarget.blur(); }} aria-label={hud.paused ? "走行を再開" : "一時停止"}>{hud.paused ? "▶" : "Ⅱ"}</button>}</div>
    <div className="checkpoint"><p>CHECKPOINT <b>{hud.checkpoint}</b> / 3 <span>{Math.floor(hud.distance)} / {COURSE_LENGTH} m</span></p><div className="progress"><i style={{ width: `${hud.distance / COURSE_LENGTH * 100}%` }} />{[25, 50, 75].map(p => <em key={p} style={{ left: `${p}%` }} />)}</div><small>{Math.round(hud.speed * 3.6)} km/h · RETRY {hud.deaths} · JUMP {Math.max(0, hud.height).toFixed(1)} m</small></div>
    <div className="controls"><span>A D / ← → 左右</span><span>SPACE ジャンプ</span><span>W 加速 / S 減速</span><span>R 最初から</span></div>
    {(hud.phase === "running" || hud.phase === "respawning") && !editing && !hud.paused && <div className="touch-controls"><div>{touchButton("left", "左へ移動", "←")}{touchButton("right", "右へ移動", "→")}</div><div>{touchButton("boost", "加速", "⚡")}{touchButton("jump", "ジャンプ", "JUMP")}</div></div>}
    {hud.phase === "respawning" && !editing && <div className="respawn-notice" role="status"><b>もう一度、ここから。</b><span>{hud.checkpoint ? `CHECKPOINT ${hud.checkpoint}` : "START"} から自動で再開</span></div>}
    {hud.paused && !editing && hud.phase !== "ready" && <div className="pause-notice"><button onClick={() => game.current?.pause(false)}>▶ 走行を再開</button></div>}
    {hud.phase === "ready" && !editing && <div className="overlay intro"><div className="card">
      <div className="eyebrow">OSAKA NIGHT / 640 M</div><h1>曲がれ。<br /><span>跳べ。走れ。</span></h1>
      <p className="lead">大阪の夜を、ジェットコースターのように。<br />進むのは自動。左右とジャンプで道を切り開こう。</p>
      <div className="howto"><div><b>01 / STEER</b>A D ・ 左スティック</div><div><b>02 / JUMP</b>SPACE ・ A / ×</div><div><b>03 / BOOST</b>W / SHIFT ・ B / ○</div><div><b>04 / COLLECT</b>緑のダイヤと青の加速</div></div>
      <button className="primary" disabled={Boolean(renderError)} onClick={e => { start(); e.currentTarget.blur(); }}>走り出す <span>→</span></button>
      {renderError && <p className="error" role="alert">{renderError}</p>}
      <p className="fineprint">ミスしてもチェックポイントから自動復帰。<br />名前は自動発行、記録も自動保存。ログイン不要。{hud.software && <><br />この端末ではGPUなしの簡易3D描画で動作しています。</>}</p>
      <details><summary>コントローラー・音声について</summary><p>Bluetoothは端末の設定でペアリング後、ボタンを押してください。Start / Menuで最初から。音声は最初の画面操作後に再生します。</p><a href="/audio-credits.txt" target="_blank" rel="noopener noreferrer">音声クレジット・ライセンス</a></details>
      {guestError && <p className="error">{guestError} <button className="text-button" onClick={() => void loadGuest()}>再試行</button></p>}
    </div></div>}
    {hud.phase === "finished" && !editing && result && <div className="overlay"><div className="card result-card">
      <div className="eyebrow">RIVER RUN / COMPLETE</div><h1>FINISH<span>{formatTime(result.timeMs)}</span></h1>
      <p className="result-summary">◆ {result.coins} 個獲得 <span>RETRY {hud.deaths}</span></p>
      <div className="saved-name"><b>{guest?.name ?? "ゲスト"}</b><button className="text-button" onClick={editName}>名前を変更</button></div>
      <p className="save-status" role="status">{saveStatus === "saved" ? "✓ ランキングに保存しました" : saveStatus === "error" ? saveError : "ランキングに自動保存中…"}</p>
      {saveStatus === "error" && <button className="secondary" onClick={() => { if (pending.current) void save(pending.current); }}>記録を再送信</button>}
      <button className="primary" onClick={e => { start(); e.currentTarget.blur(); }}>もう一度走る →</button>
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
