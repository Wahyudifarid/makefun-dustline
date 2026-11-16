// audio.js — WebAudio-synthesised sound only. No audio files, no network.
export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.noiseBuf = null; this.ready = false;
  }
  init() {
    if (this.ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ready = true;
    } catch (e) { /* audio unavailable: game stays silent */ }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  _noise(dur, filterFreq, type, gain, when = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  _tone(freq, dur, type, gain, slideTo, when = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  shot(kind, dist = 0) {
    if (!this.ready) return;
    const att = 1 / (1 + dist * 0.06); // distance attenuation
    if (kind === 'dmr') { this._noise(0.22, 900, 'lowpass', 0.9 * att); this._tone(140, 0.18, 'square', 0.25 * att, 50); }
    else if (kind === 'pistol') { this._noise(0.1, 1600, 'bandpass', 0.55 * att); this._tone(220, 0.07, 'square', 0.12 * att, 90); }
    else if (kind === 'smg') { this._noise(0.08, 2200, 'bandpass', 0.45 * att); }
    else { this._noise(0.13, 1200, 'lowpass', 0.7 * att); this._tone(180, 0.1, 'square', 0.18 * att, 60); }
  }
  dryFire() { this._tone(1400, 0.04, 'square', 0.08); }
  reload() { this._tone(500, 0.05, 'square', 0.12); this._tone(700, 0.05, 'square', 0.12, null, 0.25); this._tone(420, 0.06, 'square', 0.14, null, 0.55); }
  step(run) { this._noise(0.06, 400, 'lowpass', run ? 0.14 : 0.08); }
  hit() { this._tone(1900, 0.05, 'sine', 0.16); }
  hurt() { this._tone(160, 0.18, 'sawtooth', 0.2, 70); }
  kill() { this._tone(880, 0.09, 'sine', 0.16); this._tone(1320, 0.12, 'sine', 0.14, null, 0.09); }
  beep(final) { this._tone(final ? 1400 : 950, final ? 0.3 : 0.09, 'sine', 0.18); }
  plantTick() { this._tone(1150, 0.07, 'square', 0.1); }
  explode() {
    this._noise(0.9, 300, 'lowpass', 1.0);
    this._tone(70, 0.8, 'sine', 0.5, 30);
    this._noise(0.4, 2500, 'highpass', 0.3, 0.02);
  }
  flash() { this._noise(0.3, 4000, 'highpass', 0.5); this._tone(2400, 0.25, 'sine', 0.1, 1200); }
  sting(win) {
    const notes = win ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((f, i) => this._tone(f, 0.35, 'triangle', 0.16, null, i * 0.13));
  }
  buy() { this._tone(660, 0.07, 'sine', 0.14); this._tone(990, 0.1, 'sine', 0.14, null, 0.07); }
  denied() { this._tone(220, 0.14, 'square', 0.12, 160); }
}
export const audio = new AudioSys();
