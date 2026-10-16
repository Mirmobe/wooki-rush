/** Trippy disco-techno drums and bass, scheduled on the Web Audio clock. */

type Mood = "play" | "dead";

const BASS: number[] = [
  38, 0, 50, 38, 0, 0, 41, 0, 45, 0, 57, 45, 0, 0, 43, 0, 38, 0, 50, 0, 41, 0, 43, 0, 46,
  0, 57, 46, 0, 0, 45, 0,
];

function midiToHz(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class Disco {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private duck: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer = 0;
  private nextStep = 0;
  private step = 0;
  private bpm = 118;
  private started = false;
  musicOn = true;
  sfxOn = true;

  unlock() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) {
      const ctx = new Ctx({ latencyHint: "interactive" });
      this.ctx = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.72;
      const music = ctx.createGain();
      music.gain.value = this.musicOn ? 0.8 : 0;
      const sfx = ctx.createGain();
      sfx.gain.value = this.sfxOn ? 0.85 : 0;
      const duck = ctx.createGain();
      duck.gain.value = 1;
      const delay = ctx.createDelay(1.2);
      delay.delayTime.value = 0.22;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.28;
      const wet = ctx.createGain();
      wet.gain.value = 0.2;
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(music);
      duck.connect(music);
      music.connect(master);
      sfx.connect(master);
      master.connect(ctx.destination);
      this.master = master;
      this.music = music;
      this.sfx = sfx;
      this.duck = duck;
      this.delay = delay;

      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = noise;

      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = "sawtooth";
      o2.type = "sawtooth";
      o1.frequency.value = midiToHz(50);
      o2.frequency.value = midiToHz(57);
      o2.detune.value = 7;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 520;
      filter.Q.value = 0.7;
      const padGain = ctx.createGain();
      padGain.gain.value = 0.035;
      o1.connect(filter);
      o2.connect(filter);
      filter.connect(padGain);
      padGain.connect(duck);
      o1.start();
      o2.start();
      this.padFilter = filter;
      this.padGain = padGain;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private delay: DelayNode | null = null;
  private padGain: GainNode | null = null;

  start() {
    this.unlock();
    if (!this.ctx || this.started) return;
    this.started = true;
    this.nextStep = this.ctx.currentTime + 0.06;
    this.pump();
  }

  private pump = () => {
    const ctx = this.ctx;
    if (!ctx || !this.started) return;
    const horizon = ctx.currentTime + 0.14;
    const sp = 60 / this.bpm / 4;
    while (this.nextStep < horizon) {
      this.fire(this.step % 32, this.nextStep);
      this.step += 1;
      this.nextStep += sp;
    }
    this.timer = window.setTimeout(this.pump, 25);
  };

  setTempo(bpm: number) {
    this.bpm = bpm;
    if (this.delay && this.ctx) {
      const dotted = (60 / bpm) * 0.75 * 0.5;
      this.delay.delayTime.setTargetAtTime(dotted, this.ctx.currentTime, 0.1);
    }
  }

  mood(mood: Mood) {
    if (!this.ctx || !this.music || !this.padFilter) return;
    const t = this.ctx.currentTime;
    const live = this.musicOn ? 0.8 : 0;
    this.music.gain.setTargetAtTime(mood === "dead" ? live * 0.28 : live, t, 0.08);
    this.padFilter.frequency.setTargetAtTime(mood === "dead" ? 160 : 640, t, 0.15);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.ctx && this.music) {
      this.music.gain.setTargetAtTime(this.musicOn ? 0.8 : 0, this.ctx.currentTime, 0.03);
    }
    return this.musicOn;
  }

  toggleSfx() {
    this.sfxOn = !this.sfxOn;
    if (this.ctx && this.sfx) {
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.85 : 0, this.ctx.currentTime, 0.03);
    }
    return this.sfxOn;
  }

  dispose() {
    this.started = false;
    if (this.timer) window.clearTimeout(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }

  private destMusic() {
    return this.music;
  }

  private fire(step: number, t: number) {
    if (!this.ctx || !this.music || !this.duck) return;
    const wobble = 240 + (Math.sin(t * 0.45) * 0.5 + 0.5) * 1100;
    if (this.padFilter) this.padFilter.frequency.setValueAtTime(Math.max(140, wobble * 0.55), t);
    if (step % 4 === 0) this.kick(t);
    if (step % 8 === 4) this.clap(t);
    if (step % 2 === 1) this.hat(t, false);
    if (step % 4 === 2) this.hat(t, true);
    const note = BASS[step];
    if (note) this.bassNote(t, note, wobble);
    if (step === 0 || step === 10 || step === 16 || step === 26) this.stab(t, step);
  }

  private kick(t: number) {
    const ctx = this.ctx;
    const music = this.destMusic();
    const duck = this.duck;
    if (!ctx || !music || !duck) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(168, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g);
    g.connect(music);
    osc.start(t);
    osc.stop(t + 0.24);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    this.burstNoise(t, 0.03, 0.18, "highpass", 1800, music);
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(0.35, t);
    duck.gain.linearRampToValueAtTime(1, t + 0.18);
  }

  private clap(t: number) {
    const music = this.destMusic();
    if (!music) return;
    this.burstNoise(t, 0.09, 0.16, "bandpass", 1400, music);
    this.burstNoise(t + 0.012, 0.08, 0.1, "bandpass", 1800, music);
  }

  private hat(t: number, open: boolean) {
    const music = this.destMusic();
    if (!music) return;
    this.burstNoise(t, open ? 0.12 : 0.035, open ? 0.05 : 0.035, "highpass", open ? 6500 : 8000, music);
  }

  private bassNote(t: number, midi: number, wobble: number) {
    const ctx = this.ctx;
    const duck = this.duck;
    if (!ctx || !duck) return;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(midiToHz(midi), t);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 8;
    filter.frequency.setValueAtTime(Math.max(180, wobble), t);
    filter.frequency.exponentialRampToValueAtTime(180, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(filter);
    filter.connect(g);
    g.connect(duck);
    osc.start(t);
    osc.stop(t + 0.2);
    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  private stab(t: number, step: number) {
    const ctx = this.ctx;
    const duck = this.duck;
    if (!ctx || !duck) return;
    const chords: Record<number, number[]> = {
      0: [62, 65, 69],
      10: [65, 69, 72],
      16: [62, 65, 69],
      26: [67, 70, 74],
    };
    const notes = chords[step] ?? [62, 65, 69];
    for (const midi of notes) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(midiToHz(midi), t);
      osc.detune.value = (midi % 3) * 6;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(900, t);
      filter.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.045, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(filter);
      filter.connect(g);
      g.connect(duck);
      if (this.delay) g.connect(this.delay);
      osc.start(t);
      osc.stop(t + 0.18);
      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        g.disconnect();
      };
    }
  }

  private burstNoise(
    t: number,
    dur: number,
    peak: number,
    type: BiquadFilterType,
    freq: number,
    dest: AudioNode,
  ) {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  private tone(freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
    const ctx = this.ctx;
    const sfx = this.sfx;
    if (!ctx || !sfx || !this.sfxOn) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  jump() {
    this.tone(340, 0.12, "square", 0.08, 760);
  }

  land() {
    this.tone(150, 0.09, "sine", 0.12, 55);
    if (this.ctx && this.sfx) this.burstNoise(this.ctx.currentTime, 0.06, 0.08, "lowpass", 400, this.sfx);
  }

  slide() {
    if (this.ctx && this.sfx) this.burstNoise(this.ctx.currentTime, 0.16, 0.07, "bandpass", 700, this.sfx);
  }

  dodge(combo: number, near: boolean) {
    const f = 480 * Math.pow(1.06, Math.min(combo, 14));
    this.tone(f, 0.08, "sine", near ? 0.09 : 0.06, f * 1.25);
    if (near) this.tone(f * 1.5, 0.1, "triangle", 0.05);
  }

  spore() {
    this.tone(880, 0.08, "sine", 0.06, 1320);
    this.tone(1320, 0.12, "triangle", 0.04);
  }

  milestone() {
    this.tone(523, 0.1, "square", 0.06, 659);
    window.setTimeout(() => this.tone(784, 0.14, "square", 0.06, 1046), 90);
  }

  hit() {
    this.tone(90, 0.32, "sawtooth", 0.16, 32);
    if (this.ctx && this.sfx) this.burstNoise(this.ctx.currentTime, 0.22, 0.2, "lowpass", 500, this.sfx);
  }

  ray() {
    this.tone(880, 0.07, "square", 0.045, 240);
    this.tone(1560, 0.05, "sawtooth", 0.03, 360);
  }

  discoClear() {
    this.tone(523, 0.12, "square", 0.07, 784);
    this.tone(659, 0.18, "triangle", 0.05, 1046);
    window.setTimeout(() => this.tone(880, 0.2, "square", 0.06, 1318), 90);
  }

  cup() {
    this.tone(523, 0.16, "triangle", 0.08, 659);
    window.setTimeout(() => this.tone(784, 0.2, "triangle", 0.08, 1046), 150);
    window.setTimeout(() => this.tone(1046, 0.32, "sine", 0.07), 300);
  }
}
