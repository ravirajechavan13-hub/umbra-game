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

// ---------- level kit (cursor-advancing where it matters) ----------
function base(
  chapter: number,
  theme: Theme,
  width: number,
  goal: Rect,
): LevelData {
  return {
    chapter,
    theme,
    width,
    groundY: G,
    spawn: { x: 60, y: G - 60 },
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
const mb = (x: number, y: number, w: number, h: number, buoyant = false): Body => ({
  x,
  y,
  w,
  h,
  vx: 0,
  vy: 0,
  buoyant,
  onGround: false,
});
// ground segment (advances cursor)
const fG = (L: LevelData, x: number, w: number) => {
  L.solids.push({ x, y: G, w, h: 400 });
  return x + w;
};
// spike pit (advances cursor)
const fP = (L: LevelData, x: number, w: number) => {
  L.spikes.push({ x, y: G + 10, w, h: 30 });
  L.solids.push({ x, y: G + 40, w, h: 360 });
  return x + w;
};
// floating thin platform (no cursor)
const fPlat = (L: LevelData, x: number, y: number, w: number, h = 18) =>
  L.solids.push({ x, y, w, h });
// ceiling slab (no cursor)
const fCeil = (L: LevelData, x: number, w: number, top = 80, h = 30) =>
  L.solids.push({ x, y: top, w, h });
// water basin (advances cursor), returns water-top y
const fW = (L: LevelData, x: number, w: number) => {
  const top = G - 80;
  L.solids.push({ x, y: G + 180, w, h: 220 });
  L.water.push({ x, y: top, w, h: 260 });
  return top;
};
// rope hanging at a left-ledge right edge, tuned so the line is grabbable from the ledge
const fRope = (L: LevelData, leftEdge: number) =>
  L.ropes.push({ px: leftEdge + 88, py: 130, len: 380, angle: -0.25, angVel: 0 });
const cp = (L: LevelData, x: number) => L.checkpoints.push({ x, y: G - 60 });

// ================= PROLOGUE — TUTORIAL =================
function buildPrologue(): LevelData {
  const L = base(0, "mist", 2500, { x: 2360, y: G - 160, w: 70, h: 130 });
  let x = 0;
  x = fG(L, x, 480);
  x = fP(L, x, 80); // teaching gap
  x = fG(L, x, 940);
  // crate + plate + gate
  L.crates.push(mb(950, G - 56, 56, 56));
  L.plates.push({ x: 1170, y: G - 14, w: 80, h: 14, id: 10, pressed: false });
  const gc = G - 220;
  L.doors.push({ x: 1320, y: gc, w: 26, h: 220, open: false, link: 10, yClosed: gc, yOpen: gc - 220 });
  cp(L, 1470);
  const leftEdge = x + 70;
  x = fG(L, x, 70); // left ledge
  x = fP(L, x, 330); // rope chasm
  fRope(L, leftEdge);
  x = fG(L, x, 630);
  cp(L, 1980);
  return L;
}

// ================= CHAPTER I — THE DARK FOREST =================
function buildForest(): LevelData {
  const L = base(1, "forest", 4900, { x: 4700, y: G - 160, w: 70, h: 130 });
  let x = 0;
  x = fG(L, x, 640);
  L.bearTraps.push({ x: 300, y: G - 10, w: 46, hidden: true, sprung: false, timer: 0 });
  L.whispers.push({ x: 80, text: "The forest keeps its own silence." });
  x = fP(L, x, 110);
  cp(L, 760);
  x = fG(L, x, 560);
  // log avalanche — keep running
  L.fallingLogs.push({ x: 1180, y: 60, w: 120, h: 28, triggerX: 1150, fallen: false, vy: 0, angle: 0, restY: 60 });
  L.fallingLogs.push({ x: 1270, y: 40, w: 110, h: 26, triggerX: 1240, fallen: false, vy: 0, angle: 0, restY: 40 });
  L.bearTraps.push({ x: 1000, y: G - 10, w: 46, hidden: true, sprung: false, timer: 0 });
  L.whispers.push({ x: 880, text: "Some teeth hide beneath the leaves." });
  L.whispers.push({ x: 1120, text: "When the wood groans — do not stop." });
  x = fP(L, x, 120);
  const L1 = x + 70;
  x = fG(L, x, 70); // left ledge
  x = fP(L, x, 300); // chasm 1
  fRope(L, L1);
  const L2 = x + 60;
  x = fG(L, x, 60); // mid island
  x = fP(L, x, 300); // chasm 2
  fRope(L, L2);
  L.whispers.push({ x: 1500, text: "Two ropes. One breath between them." });
  x = fG(L, x, 700);
  cp(L, 2250);
  // spider nest over the path
  L.spiders.push({ x: 2500, ceilingY: 30, y: 50, restY: 50, triggered: false, vy: 0, phase: 0 });
  L.spiders.push({ x: 2640, ceilingY: 30, y: 50, restY: 50, triggered: false, vy: 0, phase: 1.4 });
  L.whispers.push({ x: 2380, text: "The canopy is not empty." });
  x = fP(L, x, 120);
  x = fG(L, x, 900);
  cp(L, 3080);
  // boulder chase INTO a cage-climb under pressure
  L.boulders.push({ x: 3150, y: 40, r: 34, vx: 0, vy: 0, triggerX: 3180, released: false, startX: 3150, startY: 40, angle: 0 });
  L.cages.push(mb(3250, G - 100, 70, 100));
  fPlat(L, 3400, G - 100, 30, 100); // barrier (top == cage top)
  L.whispers.push({ x: 3060, text: "Something round and old wakes behind you." });
  L.whispers.push({ x: 3320, text: "Up the cage. Now." });
  cp(L, 3560);
  x = fP(L, x, 140);
  x = fG(L, x, 700);
  // finale gauntlet: timed blades + a final hidden trap
  L.saws.push({ cx: 4300, cy: G - 90, r: 38, axis: "y", range: 70, speed: 2.4, phase: 0, angle: 0 });
  L.saws.push({ cx: 4460, cy: G - 90, r: 38, axis: "y", range: 70, speed: 2.4, phase: 1.2, angle: 0 });
  L.bearTraps.push({ x: 4600, y: G - 10, w: 46, hidden: true, sprung: false, timer: 0 });
  L.whispers.push({ x: 4180, text: "The last teeth are not hidden." });
  cp(L, 4120);
  return L;
}

// ================= CHAPTER II — THE ABANDONED RUINS =================
function buildRuins(): LevelData {
  const L = base(2, "ruins", 5200, { x: 5040, y: G - 160, w: 70, h: 130 });
  let x = 0;
  x = fG(L, x, 560);
  L.spiders.push({ x: 380, ceilingY: 30, y: 50, restY: 50, triggered: false, vy: 0, phase: 0 });
  L.whispers.push({ x: 80, text: "Stone remembers the living." });
  x = fP(L, x, 140);
  cp(L, 760);
  x = fG(L, x, 640);
  // plate + crate + gate
  L.crates.push(mb(900, G - 56, 56, 56));
  L.plates.push({ x: 1100, y: G - 14, w: 80, h: 14, id: 50, pressed: false });
  const g50 = G - 220;
  L.doors.push({ x: 1240, y: g50, w: 26, h: 220, open: false, link: 50, yClosed: g50, yOpen: g50 - 220 });
  L.whispers.push({ x: 820, text: "Feed the plate. The stones will part." });
  // moving platform over a spike chasm
  const platBase = x + 20;
  x = fP(L, x, 480);
  L.platforms.push({ x: platBase, y: G - 18, w: 110, h: 18, px: platBase, py: G - 18, axis: "x", range: 360, speed: 1.0, phase: 0 });
  L.whispers.push({ x: 1280, text: "Ride what still moves — and let go at the edge." });
  x = fG(L, x, 560);
  cp(L, 1860);
  // elevator pit-bridge (only way across)
  x = fG(L, x, 420);
  const elevX = x - 110;
  const upperStart = x;
  x = fP(L, x, 440);
  const upperEnd = x;
  L.platforms.push({ x: elevX, y: G - 18, w: 110, h: 18, px: elevX, py: G - 18, axis: "y", range: 204, speed: 1.0, phase: 0 });
  fPlat(L, upperStart, 300, upperEnd - upperStart, 40);
  L.whispers.push({ x: 2500, text: "The lift never rests. Time your feet." });
  x = fG(L, x, 560);
  cp(L, 3300);
  // cage climb over a wall
  L.cages.push(mb(x - 200, G - 100, 70, 100));
  fPlat(L, x - 60, G - 100, 30, 100); // barrier top == cage top
  L.whispers.push({ x: 3320, text: "Push the cage. The wall is only as tall as your patience." });
  // water gauntlet with a spider over it
  const wtop = fW(L, x, 760);
  L.floats.push(mb(x + 100, wtop - 24, 90, 40, true));
  L.floats.push(mb(x + 300, wtop - 24, 90, 40, true));
  L.floats.push(mb(x + 500, wtop - 24, 90, 40, true));
  L.spiders.push({ x: x + 400, ceilingY: 30, y: 50, restY: 50, triggered: false, vy: 0, phase: 0 });
  L.whispers.push({ x: x + 20, text: "Wood floats. Flesh does not. Keep moving." });
  x += 760;
  x = fG(L, x, 560);
  cp(L, 4600);
  return L;
}

// ================= CHAPTER III — THE IRON CATHEDRAL =================
function buildFactory(): LevelData {
  const L = base(3, "factory", 4400, { x: 4200, y: G - 160, w: 70, h: 130 });
  let x = 0;
  x = fG(L, x, 560);
  // kill-the-belt then time-the-blade
  L.levers.push({ x: 120, y: G, id: 40, on: false });
  L.conveyors.push({ x: 220, y: G - 12, w: 300, h: 12, dir: 1, on: true, link: 40, phase: 0 });
  L.saws.push({ cx: 540, cy: G - 90, r: 40, axis: "y", range: 70, speed: 2.2, phase: 0, angle: 0 });
  L.whispers.push({ x: 60, text: "The belt is a liar. Kill it, then watch the blade breathe." });
  x = fG(L, x, 560);
  cp(L, 600);
  // spark rhythm corridor
  x = fG(L, x, 900);
  L.sparks.push({ x: 1250, y: G - 180, w: 26, h: 180, period: 1.8, phase: 0 });
  L.sparks.push({ x: 1400, y: G - 180, w: 26, h: 180, period: 1.8, phase: 0.45 });
  L.sparks.push({ x: 1550, y: G - 180, w: 26, h: 180, period: 1.8, phase: 0.9 });
  L.sparks.push({ x: 1700, y: G - 180, w: 26, h: 180, period: 1.8, phase: 1.35 });
  L.whispers.push({ x: 1150, text: "Between the sparks, a heartbeat. Move inside it." });
  // magnet yank across a pit
x = fP(L, x, 360);
L.magnets.push({ x: x - 180, y: G - 100, r: 300, strength: 700 });
L.whispers.push({ x: x - 380, text: "Let the iron carry you. Only for a moment." });
x = fG(L, x, 1000);
cp(L, 2420);
  // repel magnet beside a blade (do not linger)
  L.magnets.push({ x: 2700, y: G - 40, r: 170, strength: -300 });
  L.saws.push({ cx: 2820, cy: G - 90, r: 38, axis: "y", range: 70, speed: 2.4, phase: 0.6, angle: 0 });
  L.whispers.push({ x: 2580, text: "The second magnet does not love you. Do not linger." });
  // timed gate with an immediate blade after it
    L.levers.push({ x: 2950, y: G, id: 41, on: false });
  const g41 = G - 220;
  L.doors.push({ x: 3080, y: g41, w: 30, h: 220, open: false, link: 41, yClosed: g41, yOpen: g41 - 220 });
  L.saws.push({ cx: 3170, cy: G - 90, r: 36, axis: "y", range: 70, speed: 2.6, phase: 0, angle: 0, link: 41 });
  L.whispers.push({ x: 2900, text: "Pull, then run. The gate forgets in three heartbeats." });
  cp(L, 3300);
  // conveyor timing gauntlet (no switch — the floor itself is the enemy)
  x = fG(L, x, 900);
  L.conveyors.push({ x: 3380, y: G - 12, w: 380, h: 12, dir: 1, on: true, phase: 0 });
  L.saws.push({ cx: 3500, cy: G - 90, r: 36, axis: "y", range: 70, speed: 2.6, phase: 0.3, angle: 0 });
  L.saws.push({ cx: 3660, cy: G - 90, r: 36, axis: "y", range: 70, speed: 2.6, phase: 1.3, angle: 0 });
  L.whispers.push({ x: 3360, text: "The floor moves. Time becomes a weapon." });
  cp(L, 3800);
  return L;
}

// ================= CHAPTER IV — THE GRAVITY VOID =================
function buildVoid(): LevelData {
  const L = base(4, "void", 3500, { x: 3400, y: 170, w: 70, h: 130 });
  let x = 0;
  x = fG(L, x, 560);
  L.whispers.push({ x: 80, text: "Down is only a suggestion here." });
  // gravity corridor 1 — walk the ceiling, dodge the blade
  x = fG(L, x, 700);
  fCeil(L, 600, 520, 80, 30);
  L.gravZones.push({ x: 600, y: 0, w: 520, h: 800, dir: -1 });
  L.saws.push({ cx: 860, cy: 150, r: 34, axis: "x", range: 120, speed: 1.7, phase: 0, angle: 0 });
  L.whispers.push({ x: 620, text: "Let go of the floor." });
  cp(L, 1240);
  // invisible faith bridge over the void
  x = fP(L, x, 560);
  L.invisibles.push({ x: 1320, y: G - 60, w: 90, h: 18 });
  L.invisibles.push({ x: 1480, y: G - 120, w: 90, h: 18 });
  L.invisibles.push({ x: 1640, y: G - 60, w: 90, h: 18 });
  L.whispers.push({ x: 1280, text: "Trust the shadow, not the air." });
  x = fG(L, x, 520);
  cp(L, 1860);
  // gravity corridor 2 — the ceiling is invisible
  x = fG(L, x, 700);
  L.gravZones.push({ x: 2340, y: 0, w: 480, h: 800, dir: -1 });
  L.invisibles.push({ x: 2360, y: 90, w: 440, h: 18 });
  L.saws.push({ cx: 2580, cy: 150, r: 32, axis: "x", range: 100, speed: 1.9, phase: 1, angle: 0 });
  L.whispers.push({ x: 2360, text: "The ceiling forgot its name. Feel for it." });
  cp(L, 2320);
  // invisible stair to the light
  L.invisibles.push({ x: 3100, y: G - 40, w: 80, h: 18 });
  L.invisibles.push({ x: 3220, y: G - 120, w: 80, h: 18 });
  L.invisibles.push({ x: 3300, y: G - 180, w: 80, h: 18 });
  L.invisibles.push({ x: 3360, y: G - 220, w: 120, h: 18 });
  L.whispers.push({ x: 3060, text: "Climb the invisible stair. The light is real." });
  cp(L, 3020);
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
                   
