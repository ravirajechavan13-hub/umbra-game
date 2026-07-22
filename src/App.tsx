import { useEffect, useRef, useState } from "react";
import { Game, type GameState } from "./game/Game";

function isTouchDevice() {
  return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
}

type Btn = "left" | "right" | "jump" | "grab" | "run" | null;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [state, setState] = useState<GameState>({
    started: false,
    deaths: 0,
    checkpoint: 0,
    checkpointTotal: 0,
    won: false,
    paused: false,
    chapter: 0,
    chapterTitle: { roman: "0", title: "Prologue", subtitle: "" },
    transition: null,
    tutorial: null,
    whisper: null,
  });
  const [audioOn, setAudioOn] = useState(true);
  const [touch] = useState(isTouchDevice);
  const [running, setRunning] = useState(false);
  const [portrait, setPortrait] = useState(
    typeof window !== "undefined" ? window.innerHeight > window.innerWidth : false,
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    const g = new Game(canvasRef.current);
    g.onState = setState;
    g.attach();
    gameRef.current = g;
    return () => g.destroy();
  }, []);

  useEffect(() => {
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // auto-advance chapter transition
  useEffect(() => {
    if (!state.transition) return;
    const id = setTimeout(() => gameRef.current?.nextChapter(), 3600);
    return () => clearTimeout(id);
  }, [state.transition]);

  const startGame = () => gameRef.current?.start();

  const holdProps = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      gameRef.current?.setKey(key, true);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      gameRef.current?.setKey(key, false);
    },
    onPointerCancel: () => gameRef.current?.setKey(key, false),
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.buttons === 0) return;
      gameRef.current?.setKey(key, false);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const toggleRun = () => {
    const next = !running;
    setRunning(next);
    gameRef.current?.setKey("shift", next);
  };

  const base =
    "relative flex select-none items-center justify-center rounded-full border bg-black/55 text-neutral-200 backdrop-blur-[2px] active:bg-white/20 transition-colors touch-none overflow-visible font-body";

  // pulsing teach ring + arrow, shown on the button the tutorial points at
  const teach = (role: Btn) =>
    state.tutorial?.button === role ? (
      <>
        <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#d62828]" style={{ animation: "umbra-ring 1.2s ease-out infinite" }} />
        <span className="pointer-events-none absolute inset-0 rounded-full border-2 border-[#d62828]" style={{ animation: "umbra-ring 1.2s ease-out infinite", animationDelay: "0.6s" }} />
        <span
          className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 text-[#e03636]"
          style={{ animation: "umbra-bob 1s ease-in-out infinite" }}
        >
          ▲
        </span>
      </>
    ) : null;

  const activeRing = (role: Btn) => (state.tutorial?.button === role ? "border-[#d62828]/80" : "border-white/20");

  return (
    <div className="relative flex h-[100dvh] w-screen items-center justify-center overflow-hidden bg-black">
      <canvas ref={canvasRef} className="h-full w-full" style={{ touchAction: "none" }} />

      {/* ===== HUD ===== */}
      {state.started && !state.won && !state.transition && (
        <div className="pointer-events-none absolute inset-0 select-none">
          <div className="absolute left-4 top-3 flex items-baseline gap-4 font-body text-[10px] uppercase tracking-[0.28em] text-neutral-400">
            <span className="font-display text-base italic tracking-[0.15em] text-neutral-200">
              {state.chapterTitle.roman === "0" ? "—" : state.chapterTitle.roman}
              <span className="ml-2 not-italic text-[10px] uppercase tracking-[0.3em] text-neutral-500">
                {state.chapterTitle.title}
              </span>
            </span>
            <span>
              deaths <span className="text-[#d8b4b4]">{String(state.deaths).padStart(2, "0")}</span>
            </span>
            <span>
              cp <span className="text-neutral-200">{state.checkpoint}</span>
              <span className="text-neutral-600">/{state.checkpointTotal}</span>
            </span>
          </div>

          <div className="absolute right-3 top-3 flex gap-1.5">
            <button
              className="pointer-events-auto rounded-sm border border-white/15 bg-black/50 px-2.5 py-1 font-body text-[10px] tracking-widest text-neutral-300 transition hover:bg-white/10"
              onClick={() => {
                const on = gameRef.current?.toggleAudio();
                setAudioOn(!!on);
              }}
            >
              {audioOn ? "sound ◆" : "sound ◇"}
            </button>
            <button
              className="pointer-events-auto rounded-sm border border-white/15 bg-black/50 px-2.5 py-1 font-body text-[10px] tracking-widest text-neutral-300 transition hover:bg-white/10"
              onClick={() => gameRef.current?.togglePause()}
            >
              {state.paused ? "resume" : "pause"}
            </button>
            <button
              className="pointer-events-auto rounded-sm border border-white/15 bg-black/50 px-2.5 py-1 font-body text-[10px] tracking-widest text-neutral-300 transition hover:bg-white/10"
              onClick={() => {
                setRunning(false);
                gameRef.current?.restart();
              }}
            >
              restart
            </button>
          </div>

          {/* whisper line (fades in & out) */}
          {state.whisper && (
            <div className="absolute inset-x-0 top-14 flex justify-center px-6">
              <p
                key={state.whisper.id}
                className="font-display text-lg italic tracking-[0.18em] text-neutral-300 sm:text-xl"
                style={{ animation: "umbra-whisper 4.4s ease-in-out forwards", textShadow: "0 2px 14px rgba(0,0,0,0.9)" }}
              >
                {state.whisper.text}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ===== Tutorial prompt (contextual, only during prologue) ===== */}
      {state.started && !state.won && !state.transition && state.tutorial && (
        <div className="pointer-events-none absolute inset-x-0 top-[28%] flex justify-center px-6">
          <div
            key={state.tutorial.text}
            className="max-w-md border-l-2 border-[#8a1414] bg-black/55 px-5 py-3 backdrop-blur-sm"
            style={{ animation: "umbra-whisper 999s ease-in-out forwards" }}
          >
            <p className="font-display text-xl italic leading-snug tracking-[0.06em] text-neutral-100 sm:text-2xl">
              {state.tutorial.text}
            </p>
          </div>
        </div>
      )}

      {/* ===== Touch controls ===== */}
      {state.started && !state.won && !state.transition && touch && !state.paused && (
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="absolute bottom-5 left-4 flex items-end gap-3">
            <button {...holdProps("arrowleft")} className={`pointer-events-auto h-[74px] w-[74px] text-2xl ${base} ${activeRing("left")}`} aria-label="Left">
              {teach("left")}◄
            </button>
            <button {...holdProps("arrowright")} className={`pointer-events-auto h-[74px] w-[74px] text-2xl ${base} ${activeRing("right")}`} aria-label="Right">
              {teach("right")}►
            </button>
          </div>

          <div className="absolute bottom-5 right-4 flex items-end gap-3">
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={toggleRun}
                className={`pointer-events-auto h-12 w-12 font-body text-[9px] uppercase tracking-widest ${base} ${
                  running ? "border-[#d62828]/80 bg-[#d62828]/15" : activeRing("run")
                }`}
                aria-label="Run"
              >
                {teach("run")}run
              </button>
              <button {...holdProps("e")} className={`pointer-events-auto h-16 w-16 font-body text-[10px] uppercase tracking-widest ${base} ${activeRing("grab")}`} aria-label="Grab">
                {teach("grab")}grab
              </button>
            </div>
            <button {...holdProps(" ")} className={`pointer-events-auto mb-1 h-[92px] w-[92px] font-body text-xs uppercase tracking-widest ${base} ${activeRing("jump")}`} aria-label="Jump">
              {teach("jump")}jump
            </button>
          </div>
        </div>
      )}

      {/* ===== Portrait nudge ===== */}
      {state.started && touch && portrait && !state.transition && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 px-8 text-center backdrop-blur-sm">
          <div className="mb-4 font-display text-5xl text-neutral-300">↻</div>
          <p className="font-display text-2xl italic tracking-[0.1em] text-neutral-200">Turn the device</p>
          <p className="mt-2 font-body text-[10px] uppercase tracking-[0.35em] text-neutral-500">
            The dark is wider sideways
          </p>
        </div>
      )}

      {/* ===== Pause overlay ===== */}
      {state.started && state.paused && !state.won && !state.transition && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
          <p className="mb-6 font-display text-5xl italic tracking-[0.2em] text-neutral-300">stillness</p>
          <button
            onClick={() => gameRef.current?.togglePause()}
            className="rounded-sm border border-white/25 px-8 py-3 font-body text-xs uppercase tracking-[0.35em] text-neutral-200 transition hover:bg-white hover:text-black"
          >
            resume
          </button>
        </div>
      )}

      {/* ===== Chapter transition card ===== */}
      {state.transition && (
        <button
          onClick={() => gameRef.current?.nextChapter()}
          className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black px-6 text-center"
          style={{ animation: "umbra-breathe 3.6s ease-in-out" }}
        >
          <div className="umbra-grain pointer-events-none absolute inset-0" />
          <p className="mb-3 font-body text-[10px] uppercase tracking-[0.6em] text-neutral-500">chapter</p>
          <p className="font-display text-[28vw] leading-none text-neutral-100 sm:text-[18vw] md:text-[12rem]">
            {state.transition.roman}
          </p>
          <div className="my-4 h-px w-24 bg-[#8a1414]" style={{ animation: "umbra-breathe 2s ease-in-out infinite" }} />
          <h2 className="font-display text-3xl italic tracking-[0.08em] text-neutral-100 sm:text-5xl">
            {state.transition.title}
          </h2>
          <p className="mt-3 font-body text-[10px] uppercase tracking-[0.4em] text-neutral-500 sm:text-xs">
            {state.transition.subtitle}
          </p>
          <p className="mt-10 font-body text-[9px] uppercase tracking-[0.5em] text-neutral-600" style={{ animation: "umbra-breathe 1.6s ease-in-out infinite" }}>
            tap to descend
          </p>
        </button>
      )}

      {/* ===== Title screen ===== */}
      {!state.started && (
        <div className="absolute inset-0 overflow-hidden bg-black">
          {/* drifting fog layers */}
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(ellipse 60% 40% at 30% 70%, rgba(80,80,86,0.35), transparent 70%), radial-gradient(ellipse 50% 30% at 75% 40%, rgba(60,60,66,0.3), transparent 70%)",
              animation: "umbra-drift 22s ease-in-out infinite alternate",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                "radial-gradient(ellipse 70% 30% at 50% 95%, rgba(30,30,34,0.9), transparent 70%)",
              animation: "umbra-drift-rev 30s ease-in-out infinite alternate",
            }}
          />
          {/* falling ash */}
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="absolute block h-[2px] w-[2px] rounded-full bg-neutral-400/60"
                style={{
                  left: `${(i * 7.3) % 100}%`,
                  top: `-5%`,
                  animation: `umbra-fall ${8 + (i % 5) * 2}s linear ${i * 0.7}s infinite`,
                }}
              />
            ))}
          </div>
          <div className="umbra-grain pointer-events-none absolute inset-0" />

          <div className="relative z-10 flex h-full flex-col px-6">
            <div className="flex items-center justify-between pt-6 font-body text-[10px] uppercase tracking-[0.4em] text-neutral-600">
              <span>a game of shadow &amp; silence</span>
              <span>mmxxvi</span>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center">
              <h1
                className="font-display text-[22vw] font-light leading-none tracking-[0.18em] text-neutral-100 sm:text-[16vw] md:text-[12rem]"
                style={{ animation: "umbra-flicker 6s linear infinite" }}
              >
                UMBRA
              </h1>
              <div className="mt-2 h-px w-40 bg-gradient-to-r from-transparent via-[#8a1414] to-transparent" style={{ animation: "umbra-breathe 3s ease-in-out infinite" }} />
              <p className="mt-4 font-display text-lg italic tracking-[0.12em] text-neutral-400 sm:text-2xl">
                a shadow that learned to walk
              </p>

              <button
                onClick={startGame}
                className="group relative mt-10 border border-white/30 px-14 py-4 font-body text-sm uppercase tracking-[0.5em] text-neutral-100 transition hover:border-white hover:bg-white hover:text-black active:bg-white active:text-black"
              >
                <span className="relative z-10">start</span>
                <span className="absolute inset-0 origin-left scale-x-0 bg-white transition-transform duration-300 group-hover:scale-x-100" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 pb-8">
              <div className="h-px w-24 bg-white/10" />
              <div className="grid max-w-sm grid-cols-2 gap-x-8 gap-y-1.5 font-body text-[10px] tracking-[0.2em] text-neutral-500">
                {touch ? (
                  <>
                    <span className="text-right text-neutral-300">◄  ►</span>
                    <span className="text-left">walk</span>
                    <span className="text-right text-neutral-300">run</span>
                    <span className="text-left">toggle sprint</span>
                    <span className="text-right text-neutral-300">jump</span>
                    <span className="text-left">leap / let go</span>
                    <span className="text-right text-neutral-300">grab</span>
                    <span className="text-left">crate · lever · rope</span>
                  </>
                ) : (
                  <>
                    <span className="text-right text-neutral-300">A / D · ← →</span>
                    <span className="text-left">walk</span>
                    <span className="text-right text-neutral-300">shift</span>
                    <span className="text-left">run</span>
                    <span className="text-right text-neutral-300">W / space</span>
                    <span className="text-left">jump / swing off</span>
                    <span className="text-right text-neutral-300">E</span>
                    <span className="text-left">grab · lever · rope</span>
                  </>
                )}
              </div>
              <p className="mt-2 font-body text-[9px] uppercase tracking-[0.4em] text-neutral-700">
                four chapters · one way out
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== Win screen ===== */}
      {state.won && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black px-6 text-center">
          <div className="umbra-grain pointer-events-none absolute inset-0" />
          <p className="mb-4 font-body text-[10px] uppercase tracking-[0.6em] text-neutral-500">the end of the dark</p>
          <h2 className="font-display text-4xl italic tracking-[0.08em] text-neutral-100 sm:text-6xl">
            You reached the light.
          </h2>
          <div className="my-5 h-px w-32 bg-[#8a1414]" />
          <p className="font-body text-xs uppercase tracking-[0.35em] text-neutral-400">
            {state.deaths} {state.deaths === 1 ? "shadow" : "shadows"} left behind
          </p>
          <button
            onClick={() => {
              setRunning(false);
              gameRef.current?.restart();
            }}
            className="mt-10 rounded-sm border border-white/25 px-10 py-3 font-body text-xs uppercase tracking-[0.35em] text-neutral-100 transition hover:bg-white hover:text-black"
          >
            wander again
          </button>
        </div>
      )}
    </div>
  );
}
