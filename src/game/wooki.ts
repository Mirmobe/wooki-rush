import { previewPathPrefix } from "@/lib/preview-path-prefix";
import { Disco } from "@/game/disco";

export const WORLD_W = 960;
const HOME_X = 236;
const TALL = 1.16;
const BALL_R = 52;
const BALL_TAP = 132;
const GRAVITY = 3600;
const JUMP_V = 1140;
const JUMP_CUT = 640;
const MAX_FALL = 1700;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.14;
const SLIDE_TIME = 0.5;
const SLIDE_BUFFER = 0.16;
const STEP = 1 / 60;
const SAVE_KEY = "wooki-rush-v1";
const HITS = 4;
const LEVELS = 10;

type Kind = "skunk" | "wooki" | "spore";
type Phase = "loading" | "menu" | "play" | "dead" | "won";
type PState = "run" | "jump" | "slide";

type Rect = { l: number; r: number; b: number; t: number };

type Actor = {
  active: boolean;
  kind: Kind;
  x: number;
  foot: number;
  passed: boolean;
  minClear: number;
  phase: number;
  flash: number;
  hint: string;
};

type Particle = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};

type Popup = {
  active: boolean;
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
};

type Bolt = { active: boolean; x: number; y: number; life: number };

type Ball = {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  hover: boolean;
  hang: number;
  spin: number;
};

export type Hud = {
  phase: Phase;
  score: number;
  best: number;
  combo: number;
  runCombo: number;
  bestCombo: number;
  killer: string;
  showCard: boolean;
  tier: string;
  newBest: boolean;
  musicOn: boolean;
  sfxOn: boolean;
  error: string;
  level: number;
  lives: number;
  progress: number;
};

type Art = {
  run: HTMLImageElement[];
  jump: HTMLImageElement[];
  slide: HTMLImageElement[];
  wooki: HTMLImageElement[];
  skunk: HTMLImageElement[];
  spore: HTMLImageElement[];
  backdrop: HTMLImageElement;
  trees: HTMLImageElement;
};

function asset(path: string) {
  const prefix = previewPathPrefix(window.location.hostname, window.location.pathname) ?? "";
  return `${prefix}${path}`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function overlap(a: Rect, b: Rect) {
  return a.l < b.r && a.r > b.l && a.b < b.t && a.t > b.b;
}

function vGap(a: Rect, b: Rect) {
  if (a.t <= b.b) return b.b - a.t;
  if (b.t <= a.b) return a.b - b.t;
  return 0;
}

function speedFor(level: number, combo: number) {
  const t = Math.min(1, Math.max(0, level - 1) / 9);
  const base = 460 + 640 * Math.pow(t, 0.9);
  const rush = Math.min(56, Math.max(0, combo - 1) * 6);
  return Math.min(1180, base + rush);
}

function chargeFor(level: number) {
  const t = Math.min(1, Math.max(0, level - 1) / 9);
  return 36 + 300 * t;
}

function tierFor(level: number) {
  if (level <= 2) return "GROOVE";
  if (level <= 5) return "RUSH";
  if (level <= 8) return "FRENZY";
  return "TRIP";
}

function goalFor(level: number) {
  return 128 + (level - 1) * 24;
}

type Save = {
  version: 1;
  best: number;
  bestCombo: number;
  music: boolean;
  sfx: boolean;
};

export class WookiGame {
  readonly audio = new Disco();
  phase: Phase = "loading";
  score = 0;
  best = 0;
  bestCombo = 0;
  combo = 0;
  comboTimer = 0;
  runCombo = 0;
  meters = 0;
  scroll = 0;
  killer = "";
  newBest = false;
  tier = "GROOVE";
  error = "";
  reduced = false;
  reel = false;
  level = 1;
  lives = HITS;
  playerX = HOME_X;
  private moveLeft = false;
  private moveRight = false;
  private levelMeters = 0;
  private iframes = 0;
  private gunCd = 0;
  private gunFlash = 0;
  private shootHeld = false;
  private discoT = 7;
  private fast = false;
  private clearFlash = 0;
  private viewH = 520;
  private jumpHeld = false;
  private slideLock = false;
  private gamepadIndex: number | null = null;
  private prevButtons: boolean[] = [];
  private gamepadCleanup: (() => void) | null = null;
  private hitstop = 0;
  private trauma = 0;
  private deadAge = 0;
  private banner = "";
  private bannerT = 0;
  private nextSpawnX = 1420;
  private spawned = 0;
  private lastKind: Kind | null = null;
  private lastX = 0;
  private acc = 0;
  private dustAcc = 0;
  private time = 0;
  private art: Art | null = null;
  private onHud: ((hud: Hud) => void) | null = null;
  private lastEmit = "";
  private player = this.freshPlayer();
  private pool: Actor[] = Array.from({ length: 36 }, () => this.freshActor());
  private motes: Particle[] = Array.from({ length: 90 }, () => this.freshParticle());
  private pops: Popup[] = Array.from({ length: 12 }, () => ({
    active: false,
    x: 0,
    y: 0,
    text: "",
    life: 0,
    color: "#d6ff3c",
  }));
  private bolts: Bolt[] = Array.from({ length: 14 }, () => ({ active: false, x: 0, y: 0, life: 0 }));
  private ball: Ball = { active: false, x: 640, y: 520, vy: 0, hover: false, hang: 0, spin: 0 };

  constructor() {
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.loadSave();
  }

  setupGamepad() {
    if (this.gamepadCleanup) return;
    const connected = (event: GamepadEvent) => {
      this.gamepadIndex = event.gamepad.index;
      this.prevButtons = [];
      console.log("Xbox connected:", event.gamepad.id);
    };
    const disconnected = (event: GamepadEvent) => {
      if (this.gamepadIndex === event.gamepad.index) {
        this.gamepadIndex = null;
        this.prevButtons = [];
      }
    };

    window.addEventListener("gamepadconnected", connected);
    window.addEventListener("gamepaddisconnected", disconnected);
    this.gamepadCleanup = () => {
      window.removeEventListener("gamepadconnected", connected);
      window.removeEventListener("gamepaddisconnected", disconnected);
    };
  }

  disposeGamepad() {
    this.gamepadCleanup?.();
    this.gamepadCleanup = null;
  }

  private pollGamepad() {
    if (this.gamepadIndex === null) return;
    const gamepad = navigator.getGamepads()[this.gamepadIndex];
    if (!gamepad) return;

    const buttons = gamepad.buttons;
    const jumpPressed = !!buttons[0]?.pressed;
    const slidePressed = !!buttons[1]?.pressed;
    const shootPressed = !!buttons[2]?.pressed;

    if (jumpPressed && !this.prevButtons[0]) this.pressJump();
    if (!jumpPressed && this.prevButtons[0]) this.releaseJump();
    if (slidePressed && !this.prevButtons[1]) this.pressSlide();
    if (!slidePressed && this.prevButtons[1]) this.releaseSlide();
    if (shootPressed && !this.prevButtons[2]) this.pressShoot();
    if (!shootPressed && this.prevButtons[2]) this.releaseShoot();

    const left = (gamepad.axes[0] ?? 0) < -0.3 || !!buttons[14]?.pressed;
    const right = (gamepad.axes[0] ?? 0) > 0.3 || !!buttons[15]?.pressed;
    if (left && !this.moveLeft) this.pressLeft();
    if (!left && this.moveLeft) this.releaseLeft();
    if (right && !this.moveRight) this.pressRight();
    if (!right && this.moveRight) this.releaseRight();

    this.prevButtons = buttons.map((button) => !!button.pressed);
  }

  setHud(fn: (hud: Hud) => void) {
    this.onHud = fn;
    this.emit(true);
  }

  async load() {
    this.setupGamepad();
    try {
      const num = async (base: string, names: string[]) =>
        Promise.all(names.map((n) => loadImage(asset(`${base}/${n}.png`))));
      const [run, jump, slide, wooki, skunk, spore, backdrop, trees] = await Promise.all([
        num("/sprites/runner-run", ["run-1", "run-2", "run-3", "run-4"]),
        num("/sprites/runner-jump", ["jump-1", "jump-2", "jump-3", "jump-4"]),
        num("/sprites/runner-slide", ["slide-1", "slide-2", "slide-3", "slide-4"]),
        num("/sprites/wooki", ["charge-1", "charge-2", "charge-3", "charge-4"]),
        num("/sprites/skunk", ["run-1", "run-2", "run-3", "run-4"]),
        num("/sprites/spore", ["fx-1", "fx-2", "fx-3", "fx-4"]),
        loadImage(asset("/sprites/backdrop.jpg")),
        loadImage(asset("/sprites/trees.png")),
      ]);
      this.art = { run, jump, slide, wooki, skunk, spore, backdrop, trees };
      this.phase = "menu";
      this.emit(true);
    } catch (err) {
      this.error = err instanceof Error ? err.message : "Art failed to load";
      this.emit(true);
    }
  }

  pressJump() {
    this.audio.unlock();
    if (this.phase === "loading") return;
    if (this.phase === "dead" || this.phase === "won") {
      if (this.phase === "dead" && this.deadAge < 0.28) return;
      this.start();
      return;
    }
    if (this.phase === "menu") this.start();
    if (this.phase === "play") {
      this.jumpHeld = true;
      this.player.jumpBuf = JUMP_BUFFER;
    }
  }

  releaseJump() {
    this.jumpHeld = false;
  }

  pressSlide() {
    this.audio.unlock();
    if (this.phase === "loading") return;
    if (this.phase === "menu") {
      this.start();
      return;
    }
    if (this.phase === "dead" || this.phase === "won") {
      if (this.phase === "dead" && this.deadAge < 0.28) return;
      if (this.phase === "won" || this.deadAge >= 0.28) this.start();
      return;
    }
    if (!this.slideLock) {
      this.slideLock = true;
      this.player.slideBuf = SLIDE_BUFFER;
    }
  }

  releaseSlide() {
    this.slideLock = false;
  }

  pressLeft() {
    this.moveLeft = true;
  }

  releaseLeft() {
    this.moveLeft = false;
  }

  pressRight() {
    this.moveRight = true;
  }

  releaseRight() {
    this.moveRight = false;
  }

  pressShoot() {
    this.audio.unlock();
    if (this.phase === "loading") return;
    if (this.phase === "menu") {
      this.start();
      return;
    }
    if (this.phase === "dead" || this.phase === "won") {
      if (this.phase === "won" || this.deadAge >= 0.28) this.start();
      return;
    }
    this.shootHeld = true;
    this.tryFire();
  }

  releaseShoot() {
    this.shootHeld = false;
  }

  armFast() {
    this.fast = true;
  }

  tapDisco(x: number, aboveGround: number) {
    if (this.phase !== "play" || !this.ball.active) return false;
    const dx = x - this.ball.x;
    const dy = aboveGround - this.ball.y;
    if (dx * dx + dy * dy > BALL_TAP * BALL_TAP) return false;
    this.popDisco();
    return true;
  }

  toggleMusic() {
    this.audio.unlock();
    this.audio.toggleMusic();
    this.save();
    this.emit(true);
  }

  toggleSfx() {
    this.audio.unlock();
    this.audio.toggleSfx();
    this.save();
    this.emit(true);
  }

  start() {
    this.audio.start();
    this.audio.mood("play");
    this.phase = "play";
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.runCombo = 0;
    this.meters = 0;
    this.killer = "";
    this.newBest = false;
    this.tier = "GROOVE";
    this.level = 1;
    this.lives = HITS;
    this.levelMeters = 0;
    this.iframes = 0;
    this.gunCd = 0;
    this.gunFlash = 0;
    this.shootHeld = false;
    this.discoT = 6.5;
    this.clearFlash = 0;
    this.ball.active = false;
    for (const b of this.bolts) b.active = false;
    this.hitstop = 0;
    this.trauma = 0;
    this.deadAge = 0;
    this.banner = "";
    this.bannerT = 0;
    this.nextSpawnX = 1420;
    this.spawned = 0;
    this.lastKind = null;
    this.lastX = 0;
    this.jumpHeld = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.playerX = HOME_X;
    this.player = this.freshPlayer();
    for (const a of this.pool) a.active = false;
    this.emit(true);
  }

  frame(dt: number) {
    this.pollGamepad();
    if (this.phase === "loading") return;
    const capped = Math.min(0.05, dt);
    this.acc += capped;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      this.step(STEP);
      this.acc -= STEP;
      steps += 1;
    }
  }

  draw(ctx: CanvasRenderingContext2D, viewH: number) {
    this.viewH = viewH;
    const groundY = viewH - 58;
    ctx.clearRect(0, 0, WORLD_W, viewH);
    ctx.fillStyle = "#07140f";
    ctx.fillRect(0, 0, WORLD_W, viewH);

    ctx.save();
    if (!this.reduced && this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const ox = Math.sin(this.time * 46) * 10 * s + Math.sin(this.time * 27) * 4 * s;
      const oy = Math.cos(this.time * 39) * 7 * s;
      ctx.translate(ox, oy);
    }

    this.drawBackdrop(ctx, viewH);
    this.drawTrees(ctx, groundY);
    this.drawActors(ctx, groundY);
    this.drawDisco(ctx, groundY);
    this.drawGround(ctx, groundY, viewH);
    this.drawPlayer(ctx, groundY);
    this.drawGun(ctx, groundY);
    this.drawBolts(ctx, groundY);
    this.drawMotes(ctx, groundY);
    this.drawPops(ctx, groundY);
    if (this.phase === "won") this.drawCup(ctx, groundY, viewH);
    if (this.bannerT > 0) this.drawBanner(ctx, viewH);
    if (this.clearFlash > 0) {
      ctx.fillStyle = `rgba(214,255,60,${this.clearFlash * 0.28})`;
      ctx.fillRect(-20, -20, WORLD_W + 40, viewH + 40);
    }
    if (!this.reduced && this.player.flash > 0.4 && this.phase === "dead") {
      ctx.fillStyle = `rgba(244,234,216,${(this.player.flash - 0.4) * 0.35})`;
      ctx.fillRect(-20, -20, WORLD_W + 40, viewH + 40);
    }
    ctx.restore();
  }

  armReel() {
    this.reel = true;
  }

  private pilot() {
    if (!this.reel || this.phase !== "play") return;
    const speed = speedFor(this.level, this.combo);
    const rel = speed + chargeFor(this.level);
    const p = this.player;
    let next: Actor | null = null;
    for (const a of this.pool) {
      if (!a.active || a.passed || a.kind === "spore") continue;
      if (!next || a.x < next.x) next = a;
    }
    if (!next) {
      this.jumpHeld = false;
      this.slideLock = false;
      return;
    }
    const box = this.actorBox(next);
    const dist = box.l - (this.playerX + 40);
    const eta = dist / Math.max(160, rel);

    if (next.kind === "skunk") {
      this.slideLock = false;
      if (p.state === "slide" && eta < 0.42) {
        p.state = "run";
        p.slideT = 0;
        p.h = 0;
        p.vy = 0;
      }
      const grounded = p.h <= 0.5 && p.state !== "jump";
      if (eta < 0.18 && eta > -0.04 && p.state !== "slide") {
        this.jumpHeld = true;
        if (grounded || p.coyote > 0) p.jumpBuf = Math.max(p.jumpBuf, JUMP_BUFFER);
      }
      if (box.r < this.playerX - 36 || p.h > 128) this.jumpHeld = false;
      if (eta < 0.55 && eta > 0.05) this.tryFire();
      return;
    }

    this.jumpHeld = false;
    if (eta < 0.5 && eta > 0.02) this.tryFire();
    const close = box.r > this.playerX - 110 && box.l < this.playerX + rel * 0.2;
    if (close && p.state === "slide") p.slideT = Math.max(p.slideT, 0.34);
    if ((eta < 0.16 || close) && p.state !== "jump") {
      this.slideLock = true;
      if (p.state !== "slide") p.slideBuf = Math.max(p.slideBuf, SLIDE_BUFFER);
    } else if (box.r < this.playerX - 120) {
      this.slideLock = false;
    }
  }

  private step(dt: number) {
    this.time += dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      if (this.phase === "dead") this.deadAge += dt;
      this.emit(false);
      return;
    }

    if (this.phase === "dead") {
      this.deadAge += dt;
      if (this.reel && this.deadAge > 1.15) {
        this.start();
        return;
      }
      const p = this.player;
      p.rot += dt * 6.5;
      p.deadVy -= 2400 * dt;
      p.deadH += p.deadVy * dt;
      if (p.deadH <= 0) {
        p.deadH = 0;
        p.deadVy *= -0.25;
        if (Math.abs(p.deadVy) < 40) p.deadVy = 0;
      }
      p.xoff -= 70 * dt;
      this.decayJuice(dt);
      this.moveMotes(dt, 80);
      this.emit(false);
      return;
    }

    if (this.phase === "won") {
      this.ball.spin += dt;
      this.clearFlash = Math.max(0, this.clearFlash - dt);
      this.decayJuice(dt);
      this.emit(false);
      return;
    }

    const playing = this.phase === "play";
    const speed = playing ? speedFor(this.level, this.combo) : 220;
    this.scroll += speed * dt;
    if (playing) {
      this.meters += (speed * dt) / 46;
      this.levelMeters += (speed * dt) / 46;
      this.score += speed * dt * 0.055;
      this.iframes = Math.max(0, this.iframes - dt);
      this.gunCd = Math.max(0, this.gunCd - dt);
      this.gunFlash = Math.max(0, this.gunFlash - dt);
      this.clearFlash = Math.max(0, this.clearFlash - dt);
      if (this.shootHeld) this.tryFire();
      if (this.combo > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.combo = 0;
      }
      this.tier = tierFor(this.level);
      this.audio.setTempo(118 + ((this.level - 1) / 9) * 18);
      this.spawn(dt, speed);
      const goal = this.fast ? 22 : goalFor(this.level);
      if (this.levelMeters >= goal) {
        if (this.level >= LEVELS) {
          this.win();
          return;
        }
        this.level += 1;
        this.levelMeters = 0;
        this.tier = tierFor(this.level);
        this.banner = `LEVEL ${this.level}`;
        this.bannerT = 1.05;
        this.audio.milestone();
      }
    }
    this.pilot();
    this.updatePlayer(dt, playing);
    this.moveBolts(dt);
    this.moveDisco(dt, playing);
    this.moveActors(dt, speed, playing);
    this.decayJuice(dt);
    this.ambient(dt, speed);
    this.emit(false);
  }

  private updatePlayer(dt: number, playing: boolean) {
    const p = this.player;
    p.anim += dt;
    if (!playing) {
      p.state = "run";
      p.h = 0;
      p.vy = 0;
      return;
    }
    const dir = (this.moveRight ? 1 : 0) - (this.moveLeft ? 1 : 0);
    if (dir) this.playerX = Math.min(500, Math.max(78, this.playerX + dir * 340 * dt));
    if (p.state !== "slide") p.jumpBuf = Math.max(0, p.jumpBuf - dt);
    if (p.state !== "slide") p.slideBuf = Math.max(0, p.slideBuf - dt);

    if (p.state === "slide") {
      p.slideT -= dt;
      p.h = 0;
      p.vy = 0;
      if (p.slideT <= 0) {
        p.state = "run";
        if (this.jumpHeld || p.jumpBuf > 0) p.jumpBuf = Math.max(p.jumpBuf, 0.08);
      }
    }

    this.tryJump();

    if (p.state === "jump") {
      if (!this.jumpHeld && p.vy > JUMP_CUT) p.vy = JUMP_CUT;
      p.vy -= GRAVITY * dt;
      if (p.vy < -MAX_FALL) p.vy = -MAX_FALL;
      p.h += p.vy * dt;
      if (p.h <= 0) {
        p.h = 0;
        p.vy = 0;
        p.state = "run";
        p.coyote = COYOTE;
        p.squash = 0.68;
        p.land = 1;
        this.audio.land();
        this.burst(this.playerX - 8, 6, 8, "#f4ead8", -40);
        if (p.slideBuf > 0) this.beginSlide();
        else this.tryJump();
      }
    } else if (p.state === "run") {
      p.coyote = COYOTE;
      if (p.slideBuf > 0) this.beginSlide();
    }

    if (p.state === "jump") p.coyote = Math.max(0, p.coyote - dt);

    const stretchTarget = p.state === "jump" ? 1 + Math.max(-0.12, Math.min(0.16, p.vy / 7000)) : 1;
    p.stretch += (stretchTarget - p.stretch) * (1 - Math.exp(-10 * dt));
    p.squash += (1 - p.squash) * (1 - Math.exp(-16 * dt));
    if (p.land > 0) p.land = Math.max(0, p.land - dt / 0.16);

    if (p.state === "run") {
      this.dustAcc += dt;
      if (this.dustAcc > 0.2) {
        this.dustAcc = 0;
        this.burst(this.playerX - 16, 4, 2, "#d6ff3c", -30);
      }
    }
  }

  private tryJump() {
    const p = this.player;
    if (p.state === "slide") return;
    const grounded = p.h <= 0.5 && p.state !== "jump";
    if (p.jumpBuf > 0 && (grounded || p.coyote > 0)) {
      p.state = "jump";
      p.vy = JUMP_V;
      p.h = Math.max(p.h, 0.1);
      p.jumpBuf = 0;
      p.coyote = 0;
      p.stretch = 1.16;
      p.squash = 0.84;
      this.audio.jump();
      this.burst(this.playerX, 8, 5, "#f4ead8", 20);
    }
  }

  private beginSlide() {
    const p = this.player;
    p.state = "slide";
    p.slideT = SLIDE_TIME;
    p.slideBuf = 0;
    p.h = 0;
    p.vy = 0;
    p.squash = 0.6;
    this.audio.slide();
    this.burst(this.playerX - 20, 6, 6, "#d6ff3c", -80);
  }

  private spawn(dt: number, speed: number) {
    const diff = Math.min(1, (this.level - 1) / 9);
    this.nextSpawnX -= (speed + chargeFor(this.level)) * dt;
    let guard = 0;
    while (this.nextSpawnX < WORLD_W + 160 && guard < 4) {
      guard += 1;
      const react = 1.05 - 0.4 * diff;
      let gap = Math.max(360, (speed * react + 170) * (0.94 + Math.random() * 0.12));
      const roll = Math.random();
      const kind: Kind =
        this.spawned === 0 ? "skunk" : this.spawned === 1 ? "wooki" : roll < 0.5 ? "skunk" : "wooki";
      if (this.lastKind && this.lastKind !== kind) gap += speed * 0.28;
      const x = this.nextSpawnX;
      this.place(kind, x, 0, this.spawned < 2);
      this.spawned += 1;
      if (kind === "skunk" && Math.random() < 0.7) this.place("spore", x + 24, 168);
      if (kind === "wooki" && Math.random() < 0.7) this.place("spore", x + 12, 8);
      if (this.spawned > 3 && diff > 0.35 && roll > 0.86) {
        const x2 = x + gap * 0.72;
        this.place(kind, x2, 0);
        this.nextSpawnX = x2;
      }
      this.lastKind = kind;
      this.lastX = x;
      this.nextSpawnX += gap;
    }
  }

  private place(kind: Kind, x: number, foot: number, hinted = false) {
    const a = this.pool.find((p) => !p.active);
    if (!a) return;
    a.active = true;
    a.kind = kind;
    a.x = x;
    a.foot = foot;
    a.passed = false;
    a.minClear = 999;
    a.phase = Math.random() * 4;
    a.flash = 0;
    a.hint = hinted ? (kind === "skunk" ? "JUMP" : "SLIDE") : "";
  }

  private moveActors(dt: number, speed: number, playing: boolean) {
    const charge = chargeFor(this.level);
    const obstacles: Actor[] = [];
    const spores: Actor[] = [];
    for (const a of this.pool) {
      if (!a.active) continue;
      a.x -= (speed + charge) * dt;
      if (a.x < -360) {
        a.active = false;
        continue;
      }
      if (!playing) continue;
      const swept = this.swept(a, (speed + charge) * dt);
      const ph = this.playerBox();
      if (overlap(swept, ph)) {
        if (a.kind === "spore") spores.push(a);
        else obstacles.push(a);
      } else if (a.kind !== "spore") {
        const nearX = swept.r > ph.l - 24 && swept.l < ph.r + 24;
        if (nearX) a.minClear = Math.min(a.minClear, vGap(swept, ph));
      }
    }
    if (obstacles.length) {
      this.hurt(obstacles[0]);
      if (this.phase !== "play") return;
    }
    for (const s of spores) this.collect(s);
    if (!playing) return;
    const ph = this.playerBox();
    for (const a of this.pool) {
      if (!a.active || a.passed || a.kind === "spore") continue;
      if (this.actorBox(a).r < ph.l) {
        a.passed = true;
        this.dodge(a);
      }
    }
  }

  private swept(a: Actor, move: number): Rect {
    const now = this.actorBox(a);
    return { l: now.l, r: now.r + move, b: now.b, t: now.t };
  }

  private actorBox(a: Actor): Rect {
    if (a.kind === "skunk") return { l: a.x - 56, r: a.x + 64, b: 0, t: 66 };
    if (a.kind === "wooki") return { l: a.x - 78, r: a.x + 92, b: 98, t: 292 };
    return { l: a.x - 18, r: a.x + 18, b: a.foot + 18, t: a.foot + 58 };
  }

  private playerBox(): Rect {
    const p = this.player;
    if (p.state === "slide") {
      const u = 1 - p.slideT / SLIDE_TIME;
      const low = u >= 0.16 && u <= 0.84;
      return low
        ? { l: this.playerX - 52, r: this.playerX + 46, b: 0, t: 36 }
        : { l: this.playerX - 36, r: this.playerX + 32, b: 0, t: 74 };
    }
    return { l: this.playerX - 18, r: this.playerX + 22, b: p.h + 10, t: p.h + 138 };
  }

  private dodge(a: Actor) {
    this.combo += 1;
    this.comboTimer = 2.55;
    this.runCombo = Math.max(this.runCombo, this.combo);
    const near = a.minClear < 34;
    const mult = 1 + (this.combo - 1) * 0.42;
    const gain = Math.round((near ? 150 : 75) * mult);
    this.score += gain;
    this.popup(this.playerX + 70, 168, near ? "CLOSE" : `+${gain}`, near ? "#ff2e88" : "#d6ff3c");
    if (this.combo % 5 === 0) {
      this.popup(this.playerX + 70, 210, `x${this.combo}`, "#f0a020");
      this.audio.milestone();
      if (!this.reduced) this.trauma = Math.min(1, this.trauma + 0.28);
    } else {
      this.audio.dodge(this.combo, near);
    }
  }

  private collect(a: Actor) {
    if (!a.active) return;
    a.active = false;
    this.combo += 1;
    this.comboTimer = 2.55;
    this.runCombo = Math.max(this.runCombo, this.combo);
    const gain = Math.round(45 * (1 + (this.combo - 1) * 0.42));
    this.score += gain;
    this.popup(a.x, a.foot + 80, `+${gain}`, "#ff2e88");
    this.audio.spore();
    this.burst(a.x, a.foot + 40, 8, "#ff2e88", 10);
  }

  private hurt(a: Actor) {
    if (this.iframes > 0) return;
    this.lives -= 1;
    this.iframes = 1.25;
    this.player.flash = 1;
    this.hitstop = this.reduced ? 0.03 : 0.07;
    this.trauma = this.reduced ? 0 : 0.62;
    a.flash = 1;
    const fur = a.kind === "wooki" ? "#c47a45" : "#f4ead8";
    this.burst(this.playerX + 16, this.player.h + 60, 14, fur, 30);
    if (this.lives <= 0) {
      this.kill(a);
      return;
    }
    this.popup(this.playerX + 70, 150, `${this.lives} LEFT`, "#f0a020");
    this.audio.hit();
    this.emit(true);
  }

  private win() {
    this.phase = "won";
    this.score += 2500;
    this.banner = "GOLD CUP";
    this.bannerT = 1.4;
    this.runCombo = Math.max(this.runCombo, this.combo);
    const finalScore = Math.floor(this.score);
    this.newBest = finalScore > this.best;
    if (this.newBest) this.best = finalScore;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.save();
    this.audio.cup();
    this.clearFlash = 1;
    this.emit(true);
  }

  private tryFire() {
    if (this.phase !== "play" || this.gunCd > 0) return;
    const slot = this.bolts.find((b) => !b.active);
    if (!slot) return;
    this.gunCd = 0.26;
    this.gunFlash = 0.1;
    slot.active = true;
    slot.x = this.playerX + 70;
    slot.y = 78;
    slot.life = 0.85;
    this.audio.ray();
  }

  private moveBolts(dt: number) {
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.x += 1320 * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x > WORLD_W + 40) {
        b.active = false;
        continue;
      }
      for (const a of this.pool) {
        if (!a.active) continue;
        const box = this.actorBox(a);
        const beam = { l: b.x - 36, r: b.x + 18, b: b.y - 50, t: b.y + 46 };
        if (!overlap(beam, box)) continue;
        b.active = false;
        if (a.kind === "spore") this.collect(a);
        else this.zap(a);
        break;
      }
    }
  }

  private zap(a: Actor) {
    if (!a.active) return;
    a.active = false;
    this.combo += 1;
    this.comboTimer = 2.55;
    this.runCombo = Math.max(this.runCombo, this.combo);
    const gain = Math.round(110 * (1 + (this.combo - 1) * 0.42));
    this.score += gain;
    this.popup(a.x, a.kind === "wooki" ? 220 : 120, `+${gain}`, "#d6ff3c");
    const fur = a.kind === "wooki" ? "#c47a45" : "#f4ead8";
    this.burst(a.x, a.kind === "wooki" ? 160 : 50, 16, fur, 80);
    this.burst(a.x, a.kind === "wooki" ? 140 : 40, 8, "#d6ff3c", 40);
    this.audio.ray();
  }

  private moveDisco(dt: number, playing: boolean) {
    if (!playing) return;
    this.discoT -= dt;
    if (!this.ball.active && this.discoT <= 0) {
      this.ball.active = true;
      this.ball.x = 520 + Math.random() * 220;
      this.ball.y = this.viewH + 40;
      this.ball.vy = -20;
      this.ball.hover = false;
      this.ball.hang = 0;
      this.discoT = 12 + Math.random() * 4;
    }
    if (!this.ball.active) return;
    this.ball.spin += dt * 2.4;
    const hang = Math.max(140, this.viewH * 0.5 - 58);
    if (!this.ball.hover) {
      this.ball.vy -= 980 * dt;
      this.ball.y += this.ball.vy * dt;
      if (this.ball.y <= hang) {
        this.ball.y = hang;
        this.ball.vy = 0;
        this.ball.hover = true;
        this.ball.hang = 7;
      }
    } else {
      this.ball.y = hang + Math.abs(Math.sin(this.time * 3)) * 10;
      this.ball.hang -= dt;
      if (this.ball.hang <= 0) this.ball.active = false;
    }
    if (!this.ball.active) return;
    const pb = this.playerBox();
    const hit =
      this.ball.x > pb.l - 24 &&
      this.ball.x < pb.r + 24 &&
      this.ball.y > pb.b - 18 &&
      this.ball.y < pb.t + 18;
    if (hit) this.popDisco();
  }

  private popDisco() {
    if (!this.ball.active) return;
    let n = 0;
    for (const a of this.pool) {
      if (!a.active || a.kind === "spore") continue;
      if (a.x < -60 || a.x > WORLD_W + 40) continue;
      a.active = false;
      const fur = a.kind === "wooki" ? "#c47a45" : "#f4ead8";
      this.burst(a.x, a.kind === "wooki" ? 170 : 60, 18, fur, 20);
      this.burst(a.x, 80, 8, "#ff2e88", 10);
      n += 1;
    }
    this.score += 180 * Math.max(1, n);
    this.combo += Math.max(1, n);
    this.comboTimer = 2.55;
    this.runCombo = Math.max(this.runCombo, this.combo);
    this.popup(this.ball.x, this.ball.y + 40, n ? `DISCO ${n}` : "DISCO", "#ff2e88");
    this.banner = "DISCO";
    this.bannerT = 0.7;
    this.clearFlash = 0.85;
    this.trauma = this.reduced ? 0 : 0.7;
    this.ball.active = false;
    this.audio.discoClear();
    this.emit(true);
  }

  private kill(a: Actor) {
    this.phase = "dead";
    this.killer = a.kind === "wooki" ? "Wooki Bigfoot" : "Skunk Ape";
    this.hitstop = this.reduced ? 0.04 : 0.09;
    this.trauma = this.reduced ? 0 : 0.95;
    this.player.flash = 1;
    this.player.deadH = this.player.h;
    this.player.deadVy = 560;
    this.player.rot = -0.2;
    this.player.xoff = 0;
    this.deadAge = 0;
    this.runCombo = Math.max(this.runCombo, this.combo);
    const finalScore = Math.floor(this.score);
    this.newBest = finalScore > this.best;
    if (this.newBest) this.best = finalScore;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.save();
    this.audio.hit();
    this.audio.mood("dead");
    a.flash = 1;
    const fur = a.kind === "wooki" ? "#c47a45" : "#f4ead8";
    this.burst(this.playerX + 20, this.player.h + 70, 24, fur, 40);
    this.burst(this.playerX, this.player.h + 50, 10, "#d6ff3c", -20);
    this.emit(true);
  }

  private popup(x: number, y: number, text: string, color: string) {
    const slot = this.pops.find((p) => !p.active) ?? this.pops[0];
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.text = text;
    slot.life = 0.7;
    slot.color = color;
  }

  private burst(x: number, y: number, n: number, color: string, bias: number) {
    let left = n;
    for (const m of this.motes) {
      if (m.active || left <= 0) continue;
      left -= 1;
      m.active = true;
      m.x = x + (Math.random() - 0.5) * 16;
      m.y = y + Math.random() * 10;
      m.vx = bias + (Math.random() - 0.5) * 180;
      m.vy = 80 + Math.random() * 220;
      m.life = 0.35 + Math.random() * 0.35;
      m.max = m.life;
      m.size = 2 + Math.random() * 4;
      m.color = color;
    }
  }

  private ambient(dt: number, speed: number) {
    if (Math.random() < dt * 8) {
      const slot = this.motes.find((m) => !m.active);
      if (!slot) return;
      slot.active = true;
      slot.x = WORLD_W + 20;
      slot.y = 80 + Math.random() * 280;
      slot.vx = -(speed * (0.3 + Math.random() * 0.5));
      slot.vy = (Math.random() - 0.5) * 20;
      slot.life = 1.4;
      slot.max = 1.4;
      slot.size = 1.5 + Math.random() * 2.5;
      slot.color = Math.random() > 0.5 ? "#ff2e88" : "#d6ff3c";
    }
  }

  private moveMotes(dt: number, drag: number) {
    for (const m of this.motes) {
      if (!m.active) continue;
      m.life -= dt;
      m.vy -= drag * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.life <= 0 || m.y < -10) m.active = false;
    }
    for (const p of this.pops) {
      if (!p.active) continue;
      p.life -= dt;
      p.y += 46 * dt;
      if (p.life <= 0) p.active = false;
    }
  }

  private decayJuice(dt: number) {
    this.player.flash = Math.max(0, this.player.flash - dt * 2.4);
    this.trauma = Math.max(0, this.trauma - dt * 1.35);
    if (this.bannerT > 0) this.bannerT -= dt;
    for (const a of this.pool) if (a.flash > 0) a.flash = Math.max(0, a.flash - dt * 2);
    this.moveMotes(dt, 420);
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D, viewH: number) {
    const img = this.art?.backdrop;
    if (!img) return;
    const dh = Math.max(viewH, 540) * TALL;
    const dw = (dh / TALL) * (img.width / img.height);
    const span = Math.max(dw, WORLD_W);
    const scroll = this.scroll * 0.12;
    const period = span * 2;
    let x = -((scroll % period) + period) % period;
    for (let i = 0; i < 3; i++) {
      const flip = Math.floor((scroll + (i === 0 ? 0 : span)) / span) % 2 === 1;
      ctx.save();
      const drawX = x + i * span;
      if (flip) {
        ctx.translate(drawX + span, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, viewH - dh, span, dh);
      } else {
        ctx.drawImage(img, drawX, viewH - dh, span, dh);
      }
      ctx.restore();
    }
    const haze = ctx.createLinearGradient(0, viewH * 0.2, 0, viewH);
    haze.addColorStop(0, "rgba(7,20,15,0.05)");
    haze.addColorStop(1, "rgba(7,20,15,0.45)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, WORLD_W, viewH);
  }

  private drawTrees(ctx: CanvasRenderingContext2D, groundY: number) {
    const img = this.art?.trees;
    if (!img) return;
    const baseH = Math.min(groundY + 30, 520);
    const dh = baseH * TALL;
    const dw = baseH * (img.width / img.height);
    const scroll = this.scroll * 0.42;
    const period = dw * 2;
    let base = -((scroll % period) + period) % period;
    for (let i = 0; i < 4; i++) {
      const flip = ((Math.floor(scroll / dw) + i) & 1) === 1;
      const x = base + i * dw;
      ctx.save();
      ctx.globalAlpha = 0.92;
      if (flip) {
        ctx.translate(x + dw, groundY + 16);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, -dh, dw, dh);
      } else {
        ctx.drawImage(img, x, groundY + 16 - dh, dw, dh);
      }
      ctx.restore();
    }
  }

  private drawGround(ctx: CanvasRenderingContext2D, groundY: number, viewH: number) {
    ctx.fillStyle = "#0c1c14";
    ctx.fillRect(0, groundY, WORLD_W, viewH - groundY + 8);
    ctx.fillStyle = "#1c3a28";
    ctx.fillRect(0, groundY, WORLD_W, 18);
    ctx.fillStyle = "#d6ff3c";
    ctx.fillRect(0, groundY, WORLD_W, 3);
    const scroll = this.scroll % 96;
    for (let x = -scroll; x < WORLD_W; x += 96) {
      ctx.fillStyle = "rgba(214,255,60,0.38)";
      ctx.fillRect(x + 10, groundY + 22, 34, 4);
      ctx.fillStyle = "rgba(255,46,136,0.28)";
      ctx.fillRect(x + 52, groundY + 30, 18, 3);
    }
    ctx.fillStyle = "rgba(4,17,12,0.55)";
    ctx.beginPath();
    ctx.ellipse(this.playerX, groundY + 2, 36, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (speedFor(this.level, this.combo) > 760 && this.phase === "play") {
      ctx.strokeStyle = "rgba(244,234,216,0.25)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i++) {
        const y = 40 + ((i * 47) % (groundY - 50));
        const x = ((i * 180 - this.scroll * 1.6) % (WORLD_W + 160)) + 160;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 36 - (i % 3) * 14, y);
        ctx.stroke();
      }
    }
  }

  private drawActors(ctx: CanvasRenderingContext2D, groundY: number) {
    const art = this.art;
    if (!art) return;
    const list = this.pool.filter((a) => a.active).sort((a, b) => a.x - b.x);
    for (const a of list) {
      const frames = a.kind === "wooki" ? art.wooki : a.kind === "skunk" ? art.skunk : art.spore;
      const idx = Math.floor(this.time * (a.kind === "spore" ? 8 : 9) + a.phase) % frames.length;
      const img = frames[idx];
      if (!img) continue;
      const base = a.kind === "wooki" ? 300 : a.kind === "skunk" ? 156 : 84;
      const drawW = base;
      const drawH = base * TALL;
      const foot = a.kind === "wooki" ? 96 : a.kind === "spore" ? a.foot : 0;
      const bob = Math.sin(this.time * 8 + a.phase) * (a.kind === "spore" ? 3 : 2);
      ctx.save();
      ctx.translate(a.x, groundY - foot + bob);
      if (a.flash > 0 && !this.reduced) ctx.filter = `brightness(${1 + a.flash * 2})`;
      const squash = a.flash > 0 ? 1.08 : 1;
      ctx.scale(squash, 1 / squash);
      ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();
      if (a.hint) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = a.hint === "JUMP" ? "#d6ff3c" : "#f0a020";
        ctx.font = "600 36px Teko, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(a.hint, a.x, groundY - (a.kind === "wooki" ? 330 : 170) * TALL);
        ctx.restore();
      }
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, groundY: number) {
    const art = this.art;
    if (!art) return;
    const p = this.player;
    const airborne = p.state === "jump" || (this.phase === "dead" && p.deadH > 2);
    const frames = p.state === "slide" && this.phase !== "dead" ? art.slide : airborne ? art.jump : art.run;
    let idx = 0;
    if (p.state === "slide" && this.phase !== "dead") {
      const u = 1 - Math.max(0, p.slideT) / SLIDE_TIME;
      idx = Math.min(3, Math.floor(u * 4));
    } else if (airborne) {
      if (p.h < 28 && p.vy > 200) idx = 0;
      else if (p.vy > 280) idx = 1;
      else if (p.vy > -80) idx = 2;
      else idx = 3;
    } else {
      const fps = 7.5 + Math.min(6, this.meters / 180);
      idx = Math.floor(p.anim * fps) % 4;
    }
    const img = frames[idx] ?? frames[0];
    if (!img) return;
    const drawW = 206;
    const drawH = 206 * TALL;
    let sy = p.squash;
    if (p.state === "jump") sy *= p.stretch;
    if (p.land > 0 && p.state === "run") sy *= 1 - 0.18 * Math.sin(p.land * Math.PI);
    sy = Math.max(0.55, sy);
    const sx = 1 / sy;
    const h = this.phase === "dead" ? p.deadH : p.h;
    const x = this.playerX + (this.phase === "dead" ? p.xoff : 0);
    ctx.save();
    ctx.translate(x, groundY - h);
    if (this.phase === "dead") ctx.rotate(p.rot);
    ctx.scale(sx, sy);
    if (p.flash > 0 && !this.reduced) ctx.filter = `brightness(${1 + p.flash * 2.4})`;
    if (this.iframes > 0 && Math.sin(this.time * 28) > 0) ctx.globalAlpha = 0.35;
    ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);
    ctx.restore();
  }

  private drawDisco(ctx: CanvasRenderingContext2D, groundY: number) {
    const b = this.ball;
    if (!b.active) return;
    const y = groundY - b.y;
    ctx.save();
    ctx.translate(b.x, y);
    ctx.rotate(b.spin);
    const r = BALL_R;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? "#d6ff3c" : i % 4 === 1 ? "#ff2e88" : "#f0a020";
      ctx.fill();
    }
    ctx.strokeStyle = "#f4ead8";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(244,234,216,0.85)";
    ctx.beginPath();
    ctx.arc(-10, -10, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "rgba(244,234,216,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x, 8);
    ctx.lineTo(b.x, y - r);
    ctx.stroke();
    if (b.hover) {
      ctx.fillStyle = "#d6ff3c";
      ctx.font = "600 32px Teko, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("TAP", b.x, y - r - 16);
    }
  }

  private drawGun(ctx: CanvasRenderingContext2D, groundY: number) {
    if (this.phase === "dead") return;
    const p = this.player;
    const h = p.h;
    const y = groundY - (p.state === "slide" ? 28 : h + 110);
    const x = this.playerX + (this.phase === "won" ? 0 : 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#04110c";
    ctx.fillRect(8, -8, 46, 16);
    ctx.fillStyle = "#d6ff3c";
    ctx.fillRect(10, -6, 34, 12);
    ctx.fillStyle = "#ff2e88";
    ctx.fillRect(40, -8, 16, 16);
    if (this.gunFlash > 0) {
      ctx.globalAlpha = this.gunFlash * 8;
      ctx.fillStyle = "#f4ead8";
      ctx.beginPath();
      ctx.arc(64, 0, 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBolts(ctx: CanvasRenderingContext2D, groundY: number) {
    for (const b of this.bolts) {
      if (!b.active) continue;
      const y = groundY - b.y;
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "#d6ff3c";
      ctx.lineWidth = 16;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(b.x - 54, y);
      ctx.lineTo(b.x + 22, y);
      ctx.stroke();
      ctx.strokeStyle = "#ff2e88";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(b.x - 40, y);
      ctx.lineTo(b.x + 26, y);
      ctx.stroke();
      ctx.fillStyle = "#f4ead8";
      ctx.beginPath();
      ctx.arc(b.x + 22, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawCup(ctx: CanvasRenderingContext2D, groundY: number, viewH: number) {
    const x = WORLD_W / 2;
    const y = Math.min(groundY - 220, viewH * 0.42);
    const bob = Math.sin(this.time * 2.2) * 6;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = "rgba(240,160,32,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 78, 54, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f0a020";
    ctx.fillRect(-28, 8, 56, 18);
    ctx.fillRect(-16, 26, 32, 16);
    ctx.beginPath();
    ctx.moveTo(-40, -36);
    ctx.lineTo(40, -36);
    ctx.lineTo(28, 10);
    ctx.lineTo(-28, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#f4ead8";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(-40, -8, 16, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(40, -8, 16, Math.PI * 1.5, Math.PI * 0.5);
    ctx.stroke();
    ctx.fillStyle = "#d6ff3c";
    ctx.font = "600 42px Teko, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("10", 0, -2);
    ctx.restore();
  }

  private drawMotes(ctx: CanvasRenderingContext2D, groundY: number) {
    for (const m of this.motes) {
      if (!m.active) continue;
      ctx.globalAlpha = Math.max(0, m.life / m.max);
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(m.x, groundY - m.y, m.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawPops(ctx: CanvasRenderingContext2D, groundY: number) {
    ctx.textAlign = "center";
    ctx.font = "600 40px Teko, sans-serif";
    for (const p of this.pops) {
      if (!p.active) continue;
      ctx.globalAlpha = Math.max(0, p.life / 0.7);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, groundY - p.y);
      ctx.globalAlpha = 1;
    }
  }

  private drawBanner(ctx: CanvasRenderingContext2D, viewH: number) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.bannerT * 2);
    ctx.fillStyle = "#f0a020";
    ctx.font = "600 64px Teko, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.banner, WORLD_W / 2, viewH * 0.28);
    ctx.restore();
  }

  private emit(force: boolean) {
    const hud = this.hud();
    const key = JSON.stringify(hud);
    if (!force && key === this.lastEmit) return;
    this.lastEmit = key;
    this.onHud?.(hud);
  }

  hud(): Hud {
    return {
      phase: this.phase,
      score: Math.floor(this.score),
      best: this.best,
      combo: this.combo,
      runCombo: this.runCombo,
      bestCombo: this.bestCombo,
      killer: this.killer,
      showCard: this.phase === "dead" || this.phase === "won",
      tier: this.tier,
      newBest: this.newBest,
      musicOn: this.audio.musicOn,
      sfxOn: this.audio.sfxOn,
      error: this.error,
      level: this.level,
      lives: Math.max(0, this.lives),
      progress: Math.min(1, this.levelMeters / (this.fast ? 22 : goalFor(this.level))),
    };
  }

  private freshPlayer() {
    return {
      state: "run" as PState,
      h: 0,
      vy: 0,
      coyote: COYOTE,
      jumpBuf: 0,
      slideBuf: 0,
      slideT: 0,
      anim: 0,
      stretch: 1,
      squash: 1,
      land: 0,
      flash: 0,
      rot: 0,
      xoff: 0,
      deadVy: 0,
      deadH: 0,
    };
  }

  private freshActor(): Actor {
    return {
      active: false,
      kind: "skunk",
      x: 0,
      foot: 0,
      passed: false,
      minClear: 999,
      phase: 0,
      flash: 0,
      hint: "",
    };
  }

  private freshParticle(): Particle {
    return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: "#d6ff3c" };
  }

  private loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<Save>;
      if (data.version !== 1) return;
      if (typeof data.best === "number" && Number.isFinite(data.best)) this.best = data.best;
      if (typeof data.bestCombo === "number" && Number.isFinite(data.bestCombo))
        this.bestCombo = data.bestCombo;
      if (data.music === false) {
        this.audio.musicOn = false;
      }
      if (data.sfx === false) this.audio.sfxOn = false;
    } catch {
      /* ignore broken saves */
    }
  }

  private save() {
    const data: Save = {
      version: 1,
      best: this.best,
      bestCombo: this.bestCombo,
      music: this.audio.musicOn,
      sfx: this.audio.sfxOn,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      /* private mode */
    }
  }

  resumeAudio() {
    this.audio.unlock();
  }
}
