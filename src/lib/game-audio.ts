import type { RunEvent } from "./autorun";

const ROOT = "https://cdn.jsdelivr.net/gh/benmarz/minimum_game@main/assets/";
/** Licensed samples plus original synthesized layers, with overlapping voices. */
export class GameAudio {
  private music = new Audio(ROOT + "Formant_1.wav");
  private context: AudioContext | null = null;
  private muted = false;
  private voices: HTMLAudioElement[] = [];
  private samples = {
    jump: new Audio(ROOT + "switch9.wav"), hit: new Audio(ROOT + "trap.wav"), coin: new Audio(ROOT + "coin-flip.wav"),
  };
  private combo = 0;
  constructor() { this.music.loop = true; this.music.volume = .16; }
  unlock() {
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => undefined); } catch { /* Audio is optional. */ }
    if (!this.muted) void this.music.play().catch(() => undefined);
  }
  mute(value: boolean) {
    this.muted = value; this.music.muted = value;
    this.voices.forEach(v => { v.muted = value; });
    if (value) void this.context?.suspend().catch(() => undefined);
    else this.unlock();
  }
  pause() { this.music.pause(); }
  private tone(frequency: number, delay: number, duration: number, type: OscillatorType = "sine", end = frequency) {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running" || this.muted) return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), start + duration);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.065, start + .008);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + .02);
  }
  play(event: RunEvent) {
    if (this.muted) return;
    if (event === "jump" || event === "hit" || event === "coin") {
      this.voices = this.voices.filter(v => !v.ended && !v.paused);
      if (this.voices.length >= 8) this.voices.shift()?.pause();
      const voice = this.samples[event].cloneNode(true) as HTMLAudioElement;
      voice.volume = event === "hit" ? .18 : .23;
      voice.playbackRate = event === "coin" ? 1 + (this.combo % 4) * .12 : .94 + Math.random() * .12;
      this.voices.push(voice); void voice.play().catch(() => undefined);
    }
    switch (event) {
      case "jump": this.tone(210, 0, .22, "triangle", 780); this.tone(440, .035, .13, "sine", 1000); break;
      case "jump-medium": this.tone(540, 0, .12, "triangle", 880); break;
      case "jump-large": this.tone(740, 0, .18, "triangle", 1320); break;
      case "coin": { const f = 660 * 2 ** ((this.combo++ % 5) / 12); this.tone(f, 0, .1); this.tone(f * 1.5, .07, .2); break; }
      case "land": this.tone(95, 0, .08, "triangle", 40); break;
      case "boost": [330, 440, 660, 880].forEach((f, i) => this.tone(f, i * .06, .18, "triangle", f * 1.1)); break;
      case "hit": this.combo = 0; this.tone(140, 0, .3, "sawtooth", 30); break;
      case "respawn": [392, 523, 784].forEach((f, i) => this.tone(f, i * .08, .15)); break;
      case "checkpoint": [523, 659, 784, 1046].forEach((f, i) => this.tone(f, i * .075, .28)); break;
      case "finish": [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, i * .12, .48)); this.music.pause(); break;
    }
  }
  dispose() {
    this.music.pause(); this.music.removeAttribute("src"); this.music.load();
    this.voices.forEach(v => { v.pause(); v.removeAttribute("src"); v.load(); });
    Object.values(this.samples).forEach(v => { v.removeAttribute("src"); v.load(); });
    void this.context?.close().catch(() => undefined);
  }
}
