import type {
  Rect,
  Body,
  Door,
  Plate,
  Lever,
  Saw,
  Boulder,
  Rope,
  Theme,
  Whisper,
  BearTrap,
  FallingLog,
  Platform,
  Conveyor,
  Spark,
  Magnet,
  GravZone,
  Spider,
} from "./types";

export interface ChapterMeta {
  roman: string;
  title: string;
  subtitle: string;
}

export const CHAPTER_META: ChapterMeta[] = [
  { roman: "0", title: "Prologue", subtitle: "Learn to move inside the dark" },
  { roman: "I", title: "The Dark Forest", subtitle: "Where the trees keep their silence" },
  { roman: "II", title: "The Abandoned Ruins", subtitle: "Stone remembers the living" },
  { roman: "III", title: "The Iron Cathedral", subtitle: "Machines that pray in sparks" },
  { roman: "IV", title: "The Gravity Void", subtitle: "The world forgets which way is down" },
];

export interface LevelData {
  chapter: number;
  theme: Theme;
  width: number;
  groundY: number;
  spawn: { x: number; y: number };
  goal: Rect;
  solids: Rect[];
  crates: Body[];
  floats: Body[];
  cages: Body[];
  doors: Door[];
  plates: Plate[];
  levers: Lever[];
  saws: Saw[];
  boulders: Boulder[];
  ropes: Rope[];
  spikes: Rect[];
  water: Rect[];
  invisibles: Rect[];
  bearTraps: BearTrap[];
  fallingLogs: FallingLog[];
  platforms: Platform[];
  conveyors: Conveyor[];
  sparks: Spark[];
  magnets: Magnet[];
  gravZones: GravZone[];
  spiders: Spider[];
  whispers: Whisper[];
  checkpoints: { x: number; y: number }[];
}

const G = 520;

function base(chapter: number, theme: Theme, width: number, spawn: { x: number; y: number }, goal: Rect): LevelData {
  return {
    chapter,
    theme,
    width,
    groundY: G,
    spawn,
    goal,
    solids: [],
    crates: [],
    floats: [],
    cages: [],
    doors: [],
    plates: [],
    levers: [],
    saws: [],
    boulders: [],
    ropes: [],
    spikes: [],
    water: [],
    invisibles: [],
    bearTraps: [],
    fallingLogs: [],
    platforms: [],
    conveyors: [],
    sparks: [],
    magnets: [],
    gravZones: [],
    spiders: [],
    whispers: [],
    checkpoints: [],
  };
}

const mkBody = (x: number, y: number, w: number, h: number, buoyant = false): Body => ({
  x,
  y,
  w,
  h,
  vx: 0,
  vy: 0,
  buoyant,
  onGround: false,
});

// ================= PROLOGUE / TUTORIAL =================
function buildPrologue(): LevelData {
  const L = base(0, "mist", 2500, { x: 60, y: G - 60 }, { x: 2360, y: G - 160, w: 70, h: 130 });
  // ground with one teaching gap
  L.solids.push({ x: -40, y: G, w: 520, h: 400 });
  L.spikes.push({ x: 480, y: G + 10, w: 80, h: 30 });
  L.solids.push({ x: 480, y: G + 40, w: 80, h: 360 });
  L.solids.push({ x: 560, y: G, w: 940, h: 400 });
  // crate + plate + gate
  L.crates.push(mkBody(950, G - 56, 56, 56));
  L.plates.push({ x: 1170, y: G - 14, w: 80, h: 14, id: 10, pressed: false });
  const gClosed = G - 220;
  L.doors.push({ x: 1320, y: gClosed, w: 26, h: 220, open: false, link: 10, yClosed: gClosed, yOpen: gClosed - 220 });
  L.checkpoints.push({ x: 1470, y: G - 60 });
  // rope chasm
  L.solids.push({ x: 1500, y: G, w: 70, h: 400 });
  L.spikes.push({ x: 1570, y: G + 10, w: 330, h: 30 });
  L.solids.push({ x: 1570, y: G + 40, w: 330, h: 360 });
  L.ropes.push({ px: 1664, py: 120, len: 380, angle: -0.25, angVel: 0 });
  L.solids.push({ x: 1900, y: G, w: 630, h: 400 });
  L.checkpoints.push({ x: 1980, y: G - 60 });
  return L;
}

// ================= CHAPTER I — THE DARK FOREST =================
function buildForest(): LevelData {
  const L = base(1, "forest", 3300, { x: 60, y: G - 60 }, { x: 3160, y: G - 170, w: 70, h: 140 });

  L.solids.push({ x: -40, y: G, w: 740, h: 400 });
  L.bearTraps.push({ x: 360, y: G - 10, w: 46, hidden: true, sprung: false, timer: 0 });
  // thorn gap
  L.spikes.push({ x: 700, y: G + 10, w: 120, h: 30 });
  L.solids.push({ x: 700, y: G + 40, w: 120, h: 360 });
  L.solids.push({ x: 820, y: G, w: 700, h: 400 });
  L.bearTraps.push({ x: 1080, y: G - 10, w: 46, hidden: true, sprung: false, timer: 0 });
  // falling log corridor (must run)
  L.fallingLogs.push({ x: 1260, y: 60, w: 120, h: 30, triggerX: 1230, fallen: false, vy: 0, angle: 0, restY: 60 });
  L.fallingLogs.push({ x: 1410, y: 40, w: 110, h: 28, triggerX: 1380, fallen: false, vy: 0, angle: 0, restY: 40 });
  // rope swing
  L.solids.push({ x: 1520, y: G, w: 60, h: 400 });
  L.spikes.push({ x: 1580, y: G + 10, w: 320, h: 30 });
  L.solids.push({ x: 1580, y: G + 40, w: 320, h: 360 });
  L.ropes.push({ px: 1674, py: 120, len: 380, angle: -0.25, angVel: 0 });
  L.solids.push({ x: 1900, y: G, w: 750, h: 400 });
  L.checkpoints.push({ x: 1960, y: G - 60 });
  // climb with crate
  L.solids.push({ x: 2430, y: G - 130, w: 30, h: 130 }); // barrier
  L.crates.push(mkBody(2230, G - 56, 56, 56));
  L.solids.push({ x: 2460, y: G - 130, w: 360, h: 400 }); // upper after barrier
  // spider in canopy
  L.spiders.push({ x: 2700, ceilingY: 40, y: 60, restY: 60, triggered: false, vy: 0, phase: 0 });
  L.solids.push({ x: 2820, y: G, w: 500, h: 400 });
  L.checkpoints.push({ x: 2880, y: G - 60 });

  L.whispers = [
    { x: 120, text: "The forest keeps its own silence." },
    { x: 980, text: "Some teeth hide beneath the leaves." },
    { x: 1230, text: "When wood groans above — run." },
    { x: 1560, text: "Swing from what the trees left behind." },
    { x: 2180, text: "Push the dead wood. Climb." },
    { x: 2620, text: "You are not alone in the canopy." },
  ];
  return L;
}

// ================= CHAPTER II — THE ABANDONED RUINS =================
function buildRuins(): LevelData {
  const L = base(2, "ruins", 3900, { x: 60, y: G - 60 }, { x: 3740, y: G - 170, w: 70, h: 140 });

  L.solids.push({ x: -40, y: G, w: 640, h: 400 });
  L.spiders.push({ x: 430, ceilingY: 30, y: 50, restY: 50, triggered: false, vy: 0, phase: 0 });
  // chasm with horizontal moving platform
  L.spikes.push({ x: 600, y: G + 200, w: 520, h: 30 });
  L.solids.push({ x: 600, y: G + 230, w: 520, h: 200 });
  L.platforms.push({ x: 620, y: G - 18, w: 110, h: 18, px: 620, py: G - 18, axis: "x", range: 360, speed: 1.0, phase: 0 });
  L.solids.push({ x: 1120, y: G, w: 520, h: 400 });
  L.checkpoints.push({ x: 1180, y: G - 60 });
  // lever + elevator to upper ledge
  L.platforms.push({ x: 1560, y: G - 18, w: 110, h: 18, px: 1560, py: G - 18, axis: "y", range: 204, speed: 1.1, phase: 0 });
  L.solids.push({ x: 1700, y: G - 220, w: 620, h: 40 }); // upper ledge
  L.solids.push({ x: 1700, y: G - 220, w: 30, h: 220 }); // left wall of upper
  // cage to climb a high barrier on upper ledge
  L.solids.push({ x: 2120, y: G - 220 - 80, w: 30, h: 80 }); // high barrier
  L.cages.push(mkBody(1880, G - 220 - 100, 70, 100));
  L.solids.push({ x: 2150, y: G - 220 - 170, w: 620, h: 40 }); // far upper ledge
  L.solids.push({ x: 2740, y: G - 220 - 170, w: 30, h: 220 + 170 }); // right wall dropping to ground
  // drop to ground
  L.solids.push({ x: 2770, y: G, w: 160, h: 400 });
  L.checkpoints.push({ x: 2820, y: G - 60 });
  // water bridge with floating crates
  const waterTop = G - 80;
  L.solids.push({ x: 2930, y: G + 180, w: 720, h: 220 }); // basin floor
  L.water.push({ x: 2930, y: waterTop, w: 720, h: 260 });
  L.floats.push(mkBody(3020, waterTop - 24, 90, 40, true));
  L.floats.push(mkBody(3230, waterTop - 24, 90, 40, true));
  L.floats.push(mkBody(3440, waterTop - 24, 90, 40, true));
  L.spiders.push({ x: 3330, ceilingY: 30, y: 50, restY: 50, triggered: false, vy: 0, phase: 0 });
  L.solids.push({ x: 3650, y: G, w: 300, h: 400 });

  L.whispers = [
    { x: 120, text: "Stone remembers the living." },
    { x: 640, text: "Ride what still moves." },
    { x: 1380, text: "The lift never rests. Time your step." },
    { x: 1900, text: "Climb the cage. The path hides above." },
    { x: 2980, text: "Wood floats where flesh does not." },
  ];
  return L;
}

// ================= CHAPTER III — THE IRON CATHEDRAL =================
function buildFactory(): LevelData {
  const L = base(3, "factory", 3800, { x: 60, y: G - 60 }, { x: 3640, y: G - 170, w: 70, h: 140 });

  L.solids.push({ x: -40, y: G, w: 720, h: 400 });
  // conveyor + lever to kill it + saw at the end
  L.conveyors.push({ x: 300, y: G - 12, w: 320, h: 12, dir: 1, on: true, link: 30, phase: 0 });
  L.levers.push({ x: 140, y: G, id: 30, on: false });
  L.saws.push({ cx: 660, cy: G - 90, r: 40, axis: "y", range: 70, speed: 2.2, phase: 0, angle: 0 });
  L.solids.push({ x: 720, y: G, w: 700, h: 400 });
  L.checkpoints.push({ x: 780, y: G - 60 });
  // spark gate (timed run)
  L.sparks.push({ x: 1040, y: G - 180, w: 28, h: 180, period: 2.2, phase: 0 });
  L.sparks.push({ x: 1220, y: G - 180, w: 28, h: 180, period: 2.2, phase: 1.1 });
  // magnet assist over pit
  L.solids.push({ x: 1420, y: G, w: 90, h: 400 });
  L.spikes.push({ x: 1510, y: G + 10, w: 380, h: 30 });
  L.solids.push({ x: 1510, y: G + 40, w: 380, h: 360 });
  L.magnets.push({ x: 1700, y: G - 260, r: 200, strength: 520 });
  L.solids.push({ x: 1890, y: G, w: 620, h: 400 });
  L.checkpoints.push({ x: 1940, y: G - 60 });
  // timed gate: lever then run
  L.levers.push({ x: 2050, y: G, id: 31, on: false, timed: 3.2 });
  const gClosed = G - 220;
  L.doors.push({ x: 2360, y: gClosed, w: 30, h: 220, open: false, link: 31, yClosed: gClosed, yOpen: gClosed - 220 });
  L.saws.push({ cx: 2200, cy: G - 30, r: 36, axis: "y", range: 60, speed: 2.2, phase: 0, angle: 0 });
  L.solids.push({ x: 2510, y: G, w: 520, h: 400 });
  // hostile magnet pulling toward saw
  L.magnets.push({ x: 2780, y: G - 40, r: 170, strength: -260 });
  L.saws.push({ cx: 2900, cy: G - 90, r: 40, axis: "y", range: 70, speed: 2.4, phase: 0, angle: 0 });
  L.solids.push({ x: 3030, y: G, w: 800, h: 400 });
  L.checkpoints.push({ x: 3080, y: G - 60 });

  L.whispers = [
    { x: 120, text: "The machines do not sleep." },
    { x: 80, text: "The belt is a liar. Kill it at the switch." },
    { x: 980, text: "Between the sparks, there is a breath." },
    { x: 1500, text: "Let the iron pull you. Only for a moment." },
    { x: 2080, text: "Pull, then run. The gate forgets quickly." },
    { x: 2700, text: "The second magnet does not love you." },
  ];
  return L;
}

// ================= CHAPTER IV — THE GRAVITY VOID =================
function buildVoid(): LevelData {
  const L = base(4, "void", 3500, { x: 60, y: G - 60 }, { x: 3320, y: 260, w: 70, h: 130 });

  L.solids.push({ x: -40, y: G, w: 640, h: 400 });
  // gravity flip corridor 1
  L.solids.push({ x: 600, y: 80, w: 520, h: 30 }); // ceiling = flipped floor
  L.gravZones.push({ x: 600, y: 0, w: 520, h: 800, dir: -1 });
  L.saws.push({ cx: 860, cy: 140, r: 34, axis: "x", range: 120, speed: 1.6, phase: 0, angle: 0 });
  L.solids.push({ x: 1120, y: G, w: 380, h: 400 });
  L.checkpoints.push({ x: 1180, y: G - 60 });
  // invisible platform chasm
  L.spikes.push({ x: 1500, y: G + 120, w: 620, h: 30 });
  L.solids.push({ x: 1500, y: G + 150, w: 620, h: 250 });
  L.invisibles.push({ x: 1560, y: G - 60, w: 90, h: 18 });
  L.invisibles.push({ x: 1720, y: G - 110, w: 90, h: 18 });
  L.invisibles.push({ x: 1880, y: G - 60, w: 90, h: 18 });
  L.invisibles.push({ x: 2020, y: G - 130, w: 90, h: 18 });
  L.solids.push({ x: 2120, y: G, w: 420, h: 400 });
  L.checkpoints.push({ x: 2180, y: G - 60 });
  // gravity flip corridor 2 with ceiling saw
  L.solids.push({ x: 2540, y: 80, w: 420, h: 30 });
  L.gravZones.push({ x: 2540, y: 0, w: 420, h: 800, dir: -1 });
  L.saws.push({ cx: 2750, cy: 140, r: 32, axis: "x", range: 90, speed: 1.9, phase: 1, angle: 0 });
  L.solids.push({ x: 2960, y: G, w: 120, h: 400 });
  // invisible stair up to floating goal
  L.invisibles.push({ x: 3080, y: G - 60, w: 80, h: 18 });
  L.invisibles.push({ x: 3180, y: G - 140, w: 80, h: 18 });
  L.invisibles.push({ x: 3280, y: G - 220, w: 110, h: 18 });

  L.whispers = [
    { x: 120, text: "Down is only a suggestion here." },
    { x: 640, text: "Let go of the floor." },
    { x: 1520, text: "Trust the shadow, not the air." },
    { x: 2560, text: "The ceiling is a floor that forgot its name." },
    { x: 3080, text: "Climb the invisible stair. The light is real." },
  ];
  return L;
}

export function buildChapter(n: number): LevelData {
  switch (n) {
    case 0:
      return buildPrologue();
    case 1:
      return buildForest();
    case 2:
      return buildRuins();
    case 3:
      return buildFactory();
    case 4:
      return buildVoid();
    default:
      return buildPrologue();
  }
}
