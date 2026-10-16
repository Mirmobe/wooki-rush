import { useEffect, useRef, useState } from "react";
import { HandCoins, Trophy, Volume2, VolumeX } from "lucide-react";
import { WORLD_W, WookiGame, type Hud } from "@/game/wooki";

const JAR = "https://cash.app/$Mirmobe";
const JAR_AMOUNTS = [1, 3, 5] as const;

function TipButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber/40 bg-moss font-display text-3xl tracking-wide text-amber"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <HandCoins className="h-6 w-6" aria-hidden />
      TIP JAR
    </button>
  );
}

function TipJar({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4" role="dialog" aria-labelledby="tip-jar-title">
      <button type="button" className="absolute inset-0 bg-ink/75" aria-label="Close tip jar" onClick={onClose} />
      <div className="card-in relative w-full max-w-md rounded-2xl border border-amber/40 bg-ink p-6">
        <p className="text-xs font-medium tracking-widest text-amber">NATHAN · $MIRMOBE</p>
        <h2 id="tip-jar-title" className="font-display text-6xl leading-none text-bone">
          TIP JAR
        </h2>
        <p className="mt-3 text-base leading-relaxed text-bone/90">
          Cash App opens with the amount filled in. The drop goes to Nathan’s jar. This game never holds the money.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {JAR_AMOUNTS.map((amount) => (
            <a
              key={amount}
              href={`${JAR}/${amount}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-14 items-center justify-center rounded-xl bg-lime font-display text-4xl text-ink"
            >
              ${amount}
            </a>
          ))}
        </div>
        <a
          href={JAR}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 flex h-12 items-center justify-center rounded-xl border border-bone/25 text-sm text-bone"
        >
          Open jar, any amount
        </a>
        <a
          href="https://x.com/Mirmobe"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block text-center text-sm text-bone/70"
        >
          Also on X @Mirmobe
        </a>
        <button
          type="button"
          className="mt-4 h-12 w-full rounded-xl border border-bone/25 font-display text-3xl tracking-wide text-bone"
          onClick={onClose}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}

const EMPTY: Hud = {
  phase: "loading",
  score: 0,
  best: 0,
  combo: 0,
  runCombo: 0,
  bestCombo: 0,
  killer: "",
  showCard: false,
  tier: "GROOVE",
  newBest: false,
  musicOn: true,
  sfxOn: true,
  error: "",
  level: 1,
  lives: 4,
  progress: 0,
};

export function WookiRush() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<WookiGame | null>(null);
  const [hud, setHud] = useState<Hud>(EMPTY);
  const [tipOpen, setTipOpen] = useState(false);
  const restartRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const game = new WookiGame();
    gameRef.current = game;
    game.setHud(setHud);
    if (new URLSearchParams(window.location.search).has("reel")) game.armReel();
    if (new URLSearchParams(window.location.search).has("fast")) game.armFast();
    void game.load();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 2 && rect.height > 2) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.floor(rect.width * dpr);
        const h = Math.floor(rect.height * dpr);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const scale = rect.width / WORLD_W;
        ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
        try {
          game.frame(dt);
          game.draw(ctx, rect.height / scale);
        } catch (err) {
          console.error(err);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        e.preventDefault();
        game.pressJump();
      } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        e.preventDefault();
        game.pressSlide();
      } else if (e.code === "KeyF" || e.code === "KeyJ") {
        e.preventDefault();
        game.pressShoot();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") game.releaseJump();
      if (e.code === "ArrowDown" || e.code === "KeyS") game.releaseSlide();
      if (e.code === "KeyF" || e.code === "KeyJ") game.releaseShoot();
    };
    const vis = () => {
      if (document.visibilityState === "visible") game.resumeAudio();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("visibilitychange", vis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("visibilitychange", vis);
      game.audio.dispose();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hud.showCard) restartRef.current?.focus();
  }, [hud.showCard]);

  const onFieldDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const game = gameRef.current;
    const canvas = canvasRef.current;
    if (!game || !canvas || e.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * WORLD_W;
    const scale = rect.width / WORLD_W;
    const above = rect.height / Math.max(0.001, scale) - 58 - (e.clientY - rect.top) / Math.max(0.001, scale);
    if (game.tapDisco(x, above)) return;
    if (e.pointerType !== "touch") {
      game.pressJump();
      return;
    }
    const y0 = e.clientY;
    let done = false;
    const timer = window.setTimeout(() => {
      if (!done) {
        done = true;
        game.pressJump();
      }
    }, 70);
    const move = (ev: PointerEvent) => {
      if (!done && ev.clientY - y0 > 48) {
        done = true;
        window.clearTimeout(timer);
        game.pressSlide();
      }
    };
    const up = () => {
      window.clearTimeout(timer);
      if (!done) {
        done = true;
        game.pressJump();
      }
      game.releaseJump();
      game.releaseSlide();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const playing = hud.phase === "play";
  const speedPct = Math.round(hud.progress * 100);

  return (
    <main
      className="flex h-dvh flex-col bg-swamp text-bone"
      data-phase={hud.phase}
      data-score={Math.floor(hud.score)}
      data-level={hud.level}
      data-lives={hud.lives}
    >
      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          onPointerDown={onFieldDown}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Wooki Rush playfield"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-4">
          <div>
            <p className="font-display text-6xl leading-none text-lime sm:text-7xl">
              {hud.score.toLocaleString()}
            </p>
            <p className="text-sm tracking-wide text-bone/80">
              BEST {hud.best.toLocaleString()}
              {playing ? ` · LV ${hud.level}/10` : ""}
            </p>
            {playing ? (
              <div className="mt-2 flex gap-1" aria-label={`${hud.lives} hits left`}>
                {Array.from({ length: 4 }, (_, i) => (
                  <span key={i} className={`h-2 w-5 rounded-full ${i < hud.lives ? "bg-lime" : "bg-moss"}`} />
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-start gap-2">
            {playing && hud.combo >= 1 ? (
              <p key={hud.combo} className="combo-pop font-display text-5xl leading-none text-mag">
                x{hud.combo}
              </p>
            ) : null}
            <div className="pointer-events-auto flex gap-2">
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-full border border-bone/25 bg-ink/80 text-bone"
                onClick={() => gameRef.current?.toggleMusic()}
                aria-label={hud.musicOn ? "Mute music" : "Unmute music"}
              >
                {hud.musicOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </button>
              <button
                type="button"
                className="h-11 rounded-full border border-bone/25 bg-ink/80 px-3 text-sm text-bone"
                onClick={() => gameRef.current?.toggleSfx()}
                aria-pressed={hud.sfxOn}
              >
                {hud.sfxOn ? "SFX" : "SFX OFF"}
              </button>
            </div>
          </div>
        </div>

        {playing ? (
          <div className="pointer-events-none absolute inset-x-8 top-24 h-1.5 overflow-hidden rounded-full bg-moss/80">
            <div className="h-full bg-lime" style={{ width: `${speedPct}%` }} />
          </div>
        ) : null}

        {hud.phase === "menu" || hud.phase === "loading" ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="card-in w-full max-w-md rounded-2xl border border-lime/30 bg-ink/85 p-6 backdrop-blur-md">
              <p className="text-xs font-medium tracking-widest text-mag">DISCO SWAMP RUN</p>
              <h1 className="font-display text-7xl leading-none text-lime sm:text-8xl">WOOKI RUSH</h1>
              <p className="mt-3 max-w-sm text-base leading-relaxed text-bone/90">
                Shoot, jump, or slide. Four hits reset the board. Clear all 10 levels and the gold cup is yours. Tap the disco ball to wipe the screen.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm text-bone/80">
                <p>
                  <span className="block font-medium text-lime">Jump</span>
                  Tap or space
                </p>
                <p>
                  <span className="block font-medium text-amber">Slide</span>
                  Swipe or S
                </p>
                <p>
                  <span className="block font-medium text-mag">Ray</span>
                  Button or F
                </p>
              </div>
              <button
                type="button"
                className="mt-5 h-14 w-full rounded-xl bg-lime font-display text-4xl tracking-wide text-ink disabled:opacity-60"
                disabled={hud.phase !== "menu"}
                onClick={() => gameRef.current?.start()}
              >
                {hud.phase === "menu" ? "RUN" : "LOADING"}
              </button>
              {hud.best > 0 ? (
                <p className="mt-3 text-center text-sm text-bone/75">
                  Best {hud.best.toLocaleString()} · combo x{hud.bestCombo}
                </p>
              ) : null}
              <TipButton onOpen={() => setTipOpen(true)} />
            </div>
          </div>
        ) : null}

        {hud.showCard && hud.phase === "won" ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="card-in w-full max-w-md rounded-2xl border border-amber/50 bg-ink/90 p-6 text-center backdrop-blur-md">
              <Trophy className="mx-auto h-16 w-16 text-amber" aria-hidden />
              <p className="mt-2 text-xs font-medium tracking-widest text-amber">LEVEL 10 CLEARED</p>
              <h2 className="font-display text-7xl leading-none text-amber">GOLD CUP</h2>
              <p className="mt-2 text-bone/80">The swamp is yours. Every Bigfoot and skunk ape is behind you.</p>
              <p className="mt-4 font-display text-7xl leading-none text-lime">{hud.score.toLocaleString()}</p>
              <div className="mt-2 flex justify-between text-sm text-bone/80">
                <span>Combo x{hud.runCombo}</span>
                <span>Best {hud.best.toLocaleString()}</span>
              </div>
              {hud.newBest ? <p className="mt-3 font-display text-3xl tracking-wide text-amber">NEW BEST</p> : null}
              <button
                ref={restartRef}
                type="button"
                className="mt-5 h-14 w-full rounded-xl bg-lime font-display text-4xl tracking-wide text-ink"
                onClick={() => gameRef.current?.start()}
              >
                AGAIN
              </button>
              <TipButton onOpen={() => setTipOpen(true)} />
            </div>
          </div>
        ) : null}

        {hud.showCard && hud.phase !== "won" ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="card-in w-full max-w-md rounded-2xl border border-mag/40 bg-ink/90 p-6 backdrop-blur-md">
              <p className="text-xs font-medium tracking-widest text-mag">CAUGHT</p>
              <h2 className="font-display text-6xl leading-none text-bone">{hud.killer}</h2>
              <p className="mt-2 text-bone/80">Four hits. The board resets.</p>
              <p className="mt-4 font-display text-7xl leading-none text-lime">
                {hud.score.toLocaleString()}
              </p>
              <div className="mt-2 flex justify-between text-sm text-bone/80">
                <span>Combo x{hud.runCombo}</span>
                <span>Best {hud.best.toLocaleString()}</span>
              </div>
              {hud.newBest ? (
                <p className="mt-3 font-display text-3xl tracking-wide text-amber">NEW BEST</p>
              ) : null}
              <button
                ref={restartRef}
                type="button"
                className="mt-5 h-14 w-full rounded-xl bg-lime font-display text-4xl tracking-wide text-ink"
                onClick={() => gameRef.current?.start()}
              >
                AGAIN
              </button>
              <p className="mt-3 text-center text-sm text-bone/60">Space or tap also restarts</p>
              <TipButton onOpen={() => setTipOpen(true)} />
            </div>
          </div>
        ) : null}

        {hud.error ? (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm text-mag">{hud.error}</p>
        ) : null}
        {tipOpen ? <TipJar onClose={() => setTipOpen(false)} /> : null}
      </div>

      <div className="safe-dock grid shrink-0 grid-cols-3 gap-2 p-3">
        <button
          type="button"
          className="h-14 rounded-xl border border-bone/25 bg-moss font-display text-4xl tracking-wide text-bone"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            gameRef.current?.pressSlide();
          }}
          onPointerUp={() => gameRef.current?.releaseSlide()}
          onPointerLeave={() => gameRef.current?.releaseSlide()}
        >
          SLIDE
        </button>
        <button
          type="button"
          className="h-14 rounded-xl bg-mag font-display text-4xl tracking-wide text-ink"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            gameRef.current?.pressShoot();
          }}
          onPointerUp={() => gameRef.current?.releaseShoot()}
          onPointerLeave={() => gameRef.current?.releaseShoot()}
        >
          RAY
        </button>
        <button
          type="button"
          className="h-14 rounded-xl bg-lime font-display text-4xl tracking-wide text-ink"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            gameRef.current?.pressJump();
          }}
          onPointerUp={() => gameRef.current?.releaseJump()}
          onPointerLeave={() => gameRef.current?.releaseJump()}
        >
          JUMP
        </button>
      </div>
    </main>
  );
}
