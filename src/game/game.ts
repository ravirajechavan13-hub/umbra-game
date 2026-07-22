import { AudioManager } from "./audio";
import { buildChapter, CHAPTER_META, type LevelData } from "./chapters";
import type { Rect, Body, Particle, Platform } from "./types";

const VW = 960;
const VH = 540;

const GRAV = 1500;
const WALK = 175;
const RUN = 300;
const JUMP_V = 560;
const GRAB_SPEED = 120;
const CONV_ACC = 1100;

type Btn = "left" | "right" | "jump" | "grab" | "run" | null;

function aabb(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export interface GameState {
  started: boolean;
  deaths: number;
  checkpoint: number;
  checkpointTotal: number;
  won: boolean;
  paused: boolean;
  chapter: number;
  chapterTitle: { roman: string; title: string; subtitle: string };
  transition: { roman: string; title: string; subtitle: string } | null;
  tutorial: { text: string; button: Btn } | null;
  whisper: { text: string; id: number } | null;
}

interface TutStep {
  until: () => boolean;
  button: Btn;
  text: string;
  world?: () => { x: number; y: number } | null;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private audio = new AudioManager();
  private level: LevelData;
  private raf = 0;
  private last = 0;
  private running = false;

  private p: Body & { onGround: boolean };
  private facing = 1;
  private coyote = 0;
  private grabbed: Body | null = null;
  private grabSide = 0;
  private onRope = false;
  private ropeIndex = -1;
  private drown = 0;
  private walkPhase = 0;
  private stepTimer = 0;
  private wasAir = false;
  private lastFallVY = 0;
  private gravSign = 1;
  private prevGravSign = 1;
  private jumpedFlag = false;
  private trail: { x: number; y: number; f: number; a: number }[] = [];

  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private targetZoom = 1;

  private dead = false;
  private deadTimer = 0;
  private ragdoll: Particle[] = [];
  private particles: Particle[] = [];
  private cpIndex = -1;
  private spawn: { x: number; y: number };

  private keys: Record<string, boolean> = {};
  private prevJump = false;
  private prevGrab = false;
  private prevGrab2 = false;

  // runtime scratch
  private platLast = new Map<Platform, { x: number; y: number }>();
  private platDelta = new Map<Platform, { dx: number; dy: number }>();
  private sparkWas = new Map<number, boolean>();
  private whisperId = 0;

  // tutorial
  private tutStep = 0;
  private transitioning = false;

  state: GameState;
  onState: (s: GameState) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.level = buildChapter(0);
    this.spawn = { ...this.level.spawn };
    this.p = { x: this.spawn.x, y: this.spawn.y, w: 22, h: 42, vx: 0, vy: 0, onGround: false };
    this.state = {
      started: false,
      deaths: 0,
      checkpoint: 0,
      checkpointTotal: this.level.checkpoints.length,
      won: false,
      paused: false,
      chapter: 0,
      chapterTitle: CHAPTER_META[0],
      transition: null,
      tutorial: null,
      whisper: null,
    };
  }

  private emit() {
    this.onState({ ...this.state });
  }

  start() {
    this.audio.start();
    this.audio.setThemeBed(this.level.theme);
    this.state.started = true;
    this.running = true;
    this.emit();
    this.last = performance.now();
    this.loop();
  }

  togglePause() {
    if (this.transitioning) return;
    this.state.paused = !this.state.paused;
    this.emit();
    if (!this.state.paused) {
      this.last = performance.now();
      this.loop();
    }
  }

  toggleAudio() {
    return this.audio.toggle();
  }

  setKey(name: string, down: boolean) {
    this.keys[name] = down;
  }

  attach() {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
  }
  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    this.keys[k] = true;
    if (k === "p") this.togglePause();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.key.toLowerCase()] = false;
  };

  restart() {
    this.state.chapter = 0;
    this.state.deaths = 0;
    this.loadChapter(0);
    this.state.won = false;
    this.transitioning = false;
    this.state.transition = null;
    this.emit();
  }

  nextChapter() {
    if (!this.transitioning) return;
    const next = this.state.chapter + 1;
    this.loadChapter(next);
    this.transitioning = false;
    this.state.transition = null;
    this.state.chapter = next;
    this.state.chapterTitle = CHAPTER_META[next];
    this.state.whisper = null;
    this.audio.setThemeBed(this.level.theme);
    this.emit();
  }

  private loadChapter(n: number) {
    this.level = buildChapter(n);
    this.spawn = { ...this.level.spawn };
    this.cpIndex = -1;
    this.state.checkpoint = 0;
    this.state.checkpointTotal = this.level.checkpoints.length;
    this.platLast.clear();
    this.platDelta.clear();
    this.sparkWas.clear();
    this.whisperId = 0;
    this.tutStep = 0;
    this.jumpedFlag = false;
    this.particles = [];
    this.trail = [];
    this.respawn();
  }

  private respawn() {
    this.p.x = this.spawn.x;
    this.p.y = this.spawn.y;
    this.p.vx = 0;
    this.p.vy = 0;
    this.p.onGround = false;
    this.dead = false;
    this.deadTimer = 0;
    this.grabbed = null;
    this.onRope = false;
    this.drown = 0;
    this.ragdoll = [];
    this.gravSign = 1;
    this.prevGravSign = 1;
  }

  private die(kind: string) {
    if (this.dead) return;
    this.dead = true;
    this.deadTimer = 1.0;
    this.state.deaths++;
    this.emit();
    this.audio.death();
    this.ragdoll = [];
    for (let i = 0; i < 16; i++) {
      this.ragdoll.push({
        x: this.p.x + this.p.w / 2,
        y: this.p.y + this.p.h / 2,
        vx: (Math.random() - 0.5) * 340,
        vy: -Math.random() * 360 - 40,
        life: 1.2,
        size: 3 + Math.random() * 5,
      });
    }
    if (kind === "water") this.audio.splash();
  }

  private loop = () => {
    if (!this.running || this.state.paused) return;
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  // ---------- collision helpers ----------
  private playerSolids(): Rect[] {
    const s: Rect[] = [
      ...this.level.solids,
      ...this.level.invisibles,
      ...this.level.crates,
      ...this.level.cages,
      ...this.level.floats,
    ];
    for (const d of this.level.doors) if (!d.open) s.push(d);
    for (const pl of this.level.platforms) s.push(pl);
    return s;
  }

  private moveX(body: Body, dx: number, solids: Rect[]) {
    body.x += dx;
    for (const s of solids) {
      if (aabb(body, s)) {
        // step up small ledges / platform edges while grounded
        if (body.onGround && dx !== 0 && body.y + body.h - s.y > 0 && body.y + body.h - s.y <= 20) {
          body.y = s.y - body.h;
          continue;
        }
        if (dx > 0) body.x = s.x - body.w;
        else if (dx < 0) body.x = s.x + s.w;
        body.vx = 0;
      }
    }
  }
  private moveY(body: Body, dy: number, solids: Rect[], sign = 1) {
    body.y += dy;
    body.onGround = false;
    for (const s of solids) {
      if (aabb(body, s)) {
        if (dy > 0) {
          body.y = s.y - body.h;
          if (sign > 0) body.onGround = true;
        } else if (dy < 0) {
          body.y = s.y + s.h;
          if (sign < 0) body.onGround = true;
        }
        body.vy = 0;
      }
    }
  }

  private inWater(r: Rect): { depth: number } | null {
    for (const w of this.level.water) {
      if (aabb(r, w)) {
        const depth = Math.min(r.h, r.y + r.h - w.y);
        return { depth: Math.max(0, depth) };
      }
    }
    return null;
  }

  private feetRect(): Rect {
    const y = this.gravSign > 0 ? this.p.y + this.p.h - 10 : this.p.y;
    return { x: this.p.x + 2, y, w: this.p.w - 4, h: 12 };
  }

  // ---------- main update ----------
  private update(dt: number) {
    if (this.transitioning) {
      this.updateParticles(dt);
      return;
    }
    if (this.state.won) {
      this.updateParticles(dt);
      this.updateCamera(dt);
      return;
    }
    if (this.dead) {
      this.deadTimer -= dt;
      for (const r of this.ragdoll) {
        r.vy += GRAV * dt * 0.7;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.life -= dt;
      }
      if (this.deadTimer <= 0) this.respawn();
      this.updateCamera(dt);
      return;
    }

    this.updatePlatforms(dt);
    this.updateBodies(dt);
    this.applyRiding();
    this.updatePlayer(dt);
    this.updateSaws(dt);
    this.updateBoulders(dt);
    this.updateRopes(dt);
    this.updateBearTraps(dt);
    this.updateFallingLogs(dt);
    this.updateSpiders(dt);
    this.updateSparks();
    this.updateMechanisms(dt);
    this.updateParticles(dt);
    this.spawnThemeParticles(dt);
    this.checkHazards();
    this.checkProgress();
    if (this.level.chapter === 0) this.updateTutorial();
    else this.state.tutorial = null;
    this.updateCamera(dt);
    this.updateAudioAmbience();
  }

  // ---------- platforms ----------
  private updatePlatforms(dt: number) {
    const active = (pl: Platform) => {
      if (pl.link == null) return true;
      for (const lv of this.level.levers) if (lv.id === pl.link && lv.on) return true;
      for (const pt of this.level.plates) if (pt.id === pl.link && pt.pressed) return true;
      return false;
    };
    for (const pl of this.level.platforms) {
      const last = this.platLast.get(pl) ?? { x: pl.x, y: pl.y };
      let nx = pl.x;
      let ny = pl.y;
      if (pl.axis !== "none" && active(pl)) {
        pl.phase += pl.speed * dt;
        if (pl.axis === "x") nx = pl.px + Math.sin(pl.phase) * pl.range;
        else ny = pl.py - (Math.sin(pl.phase) * 0.5 + 0.5) * pl.range; // one-way lift
      }
      this.platDelta.set(pl, { dx: nx - last.x, dy: ny - last.y });
      pl.x = nx;
      pl.y = ny;
      this.platLast.set(pl, { x: nx, y: ny });
    }
  }

  private applyRiding() {
    if (this.gravSign < 0) return;
    const sensor = { x: this.p.x + 1, y: this.p.y + this.p.h - 3, w: this.p.w - 2, h: 6 };
    for (const pl of this.level.platforms) {
      if (aabb(sensor, pl) && Math.abs(this.p.y + this.p.h - pl.y) < 6) {
        const d = this.platDelta.get(pl);
        if (d) {
          this.p.x += d.dx;
          this.p.y += d.dy;
        }
        return;
      }
    }
  }

  // ---------- bodies (crates, cages, floats) ----------
  private updateBodies(dt: number) {
    const solids: Rect[] = [...this.level.solids, ...this.level.invisibles];
    for (const d of this.level.doors) if (!d.open) solids.push(d);
    for (const pl of this.level.platforms) solids.push(pl);
    const all = [...this.level.crates, ...this.level.cages, ...this.level.floats];

    for (const b of all) {
      const others = all.filter((o) => o !== b);
      const obstacles = [...solids, ...others];
      const water = this.inWater(b);
      if (b.buoyant && water) {
        const sub = water.depth / b.h;
        b.vy -= sub * 900 * dt;
        b.vy *= 0.9;
        b.vx *= 0.9;
        b.vy += GRAV * 0.4 * dt;
      } else {
        b.vy += GRAV * dt;
      }
      // conveyor push
      if (b.onGround) {
        for (const c of this.level.conveyors) {
          if (!c.on) continue;
          const foot = { x: b.x + 2, y: b.y + b.h - 4, w: b.w - 4, h: 8 };
          if (aabb(foot, c)) b.vx += c.dir * 600 * dt;
        }
      }
      b.vx *= 0.82;
      if (Math.abs(b.vx) < 2) b.vx = 0;
      this.moveX(b, b.vx * dt, obstacles);
      this.moveY(b, b.vy * dt, obstacles);
    }
  }

  // ---------- player ----------
  private updatePlayer(dt: number) {
    const p = this.p;
    const left = this.keys["arrowleft"] || this.keys["a"];
    const right = this.keys["arrowright"] || this.keys["d"];
    const up = this.keys["arrowup"] || this.keys["w"];
    const running = this.keys["shift"];
    const jump = this.keys[" "] || up;
    const grabKey = this.keys["e"] || this.keys["k"];

    // gravity zone
    const pcx = p.x + p.w / 2;
    const pcy = p.y + p.h / 2;
    let gs = 1;
    for (const z of this.level.gravZones) {
      if (pcx > z.x && pcx < z.x + z.w && pcy > z.y && pcy < z.y + z.h) {
        gs = z.dir;
        break;
      }
    }
    this.prevGravSign = this.gravSign;
    this.gravSign = gs;
    if (this.gravSign !== this.prevGravSign) this.audio.gravFlip();

    const water = this.inWater({ ...p });

    // rope
    if (this.onRope) {
      const rope = this.level.ropes[this.ropeIndex];
      if (left) rope.angVel -= 2.2 * dt;
      if (right) rope.angVel += 2.2 * dt;
      rope.angVel += (-9.8 / rope.len) * Math.sin(rope.angle) * dt * 6;
      rope.angVel *= 0.995;
      rope.angle += rope.angVel * dt;
      const ex = rope.px + Math.sin(rope.angle) * rope.len;
      const ey = rope.py + Math.cos(rope.angle) * rope.len;
      p.x = ex - p.w / 2;
      p.y = ey - 6;
      p.vx = Math.cos(rope.angle) * rope.angVel * rope.len;
      p.vy = -Math.sin(rope.angle) * rope.angVel * rope.len;
      const jumpPressed = jump && !this.prevJump;
      if (jumpPressed || !grabKey) {
        this.onRope = false;
        p.vy -= 260;
        this.audio.jump();
      }
      this.prevJump = jump;
      this.prevGrab = grabKey;
      return;
    }

    if (grabKey && !this.prevGrab) {
      for (let i = 0; i < this.level.ropes.length; i++) {
        const rope = this.level.ropes[i];
        const ex = rope.px + Math.sin(rope.angle) * rope.len;
        const ey = rope.py + Math.cos(rope.angle) * rope.len;
        const dEnd = Math.hypot(pcx - ex, pcy - ey);
        const dSeg = this.distToSeg(pcx, pcy, rope.px, rope.py, ex, ey);
        if (dEnd < 95 || dSeg < 60) {
          this.onRope = true;
          this.ropeIndex = i;
          rope.angVel += (this.facing >= 0 ? 1 : -1) * 1.8; // swing assist
          this.prevJump = jump;
          this.prevGrab = grabKey;
          return;
        }
      }
    }

    // horizontal
    let speed = running ? RUN : WALK;
    if (this.grabbed) speed = GRAB_SPEED;
    if (water) speed *= 0.6;
    let target = 0;
    if (left) {
      target = -speed;
      this.facing = -1;
    }
    if (right) {
      target = speed;
      this.facing = 1;
    }
    const accel = p.onGround ? 2400 : 1200;
    if (target !== 0) {
      p.vx += Math.sign(target - p.vx) * accel * dt;
      if ((target > 0 && p.vx > target) || (target < 0 && p.vx < target)) p.vx = target;
    } else {
      const fr = p.onGround ? 2600 : 600;
      if (p.vx > 0) p.vx = Math.max(0, p.vx - fr * dt);
      else p.vx = Math.min(0, p.vx + fr * dt);
    }

    // conveyor push on player
    let onConv = 0;
    if (p.onGround && this.gravSign > 0) {
      for (const c of this.level.conveyors) {
        if (!c.on) continue;
        const foot = { x: p.x + 2, y: p.y + p.h - 4, w: p.w - 4, h: 8 };
        if (aabb(foot, c)) onConv = c.dir;
      }
    }
    if (onConv !== 0) p.vx += onConv * CONV_ACC * dt;

    // magnet pull
    let magInt = 0;
    for (const m of this.level.magnets) {
      const d = Math.hypot(pcx - m.x, pcy - m.y);
      if (d < m.r && d > 1) {
        const f = m.strength * (1 - d / m.r);
        const ux = (m.x - pcx) / d;
        const uy = (m.y - pcy) / d;
        p.vx += ux * f * dt;
        p.vy += uy * f * dt;
        magInt = Math.max(magInt, 1 - d / m.r);
      }
    }
    this.audio.setMagnet(magInt);

    // gravity / jump
    if (water) {
      p.vy += GRAV * 0.35 * dt;
      p.vy *= 0.92;
      if (jump) p.vy -= 520 * dt * 8;
      if (p.vy > 180) p.vy = 180;
    } else {
      p.vy += GRAV * this.gravSign * dt;
    }

    if (p.onGround) this.coyote = 0.1;
    else this.coyote -= dt;

    const jumpPressed = jump && !this.prevJump;
    if (jumpPressed && (this.coyote > 0 || water)) {
      p.vy = -JUMP_V * this.gravSign * (water ? 0.7 : 1);
      p.onGround = false;
      this.coyote = 0;
      this.jumpedFlag = true;
      this.audio.jump();
      this.spawnDust(p.x + p.w / 2, this.gravSign > 0 ? p.y + p.h : p.y);
    }

    // grab crates / cages
    if (grabKey) {
      if (!this.grabbed && p.onGround) {
        const pool = [...this.level.crates, ...this.level.cages];
        for (const c of pool) {
          const vOverlap = p.y + p.h > c.y + 6 && p.y < c.y + c.h;
          if (!vOverlap) continue;
          if (Math.abs(p.x + p.w - c.x) < 10) {
            this.grabbed = c;
            this.grabSide = 1;
            break;
          }
          if (Math.abs(p.x - (c.x + c.w)) < 10) {
            this.grabbed = c;
            this.grabSide = -1;
            break;
          }
        }
      }
    } else {
      this.grabbed = null;
    }

    const solids = this.playerSolids();
    const pSolids = solids.filter((s) => s !== (this.grabbed as unknown as Rect));

    const oldX = p.x;
    this.moveX(p, p.vx * dt, pSolids);
    const dx = p.x - oldX;

    if (this.grabbed) {
      const c = this.grabbed;
      const crateObs = [
        ...this.level.solids,
        ...this.level.invisibles,
        ...this.level.doors.filter((d) => !d.open),
        ...this.level.crates.filter((o) => o !== c),
        ...this.level.cages.filter((o) => o !== c),
        ...this.level.floats,
        ...this.level.platforms,
      ];
      const before = c.x;
      c.x += dx;
      for (const s of crateObs) {
        if (aabb(c, s)) {
          if (dx > 0) c.x = s.x - c.w;
          else if (dx < 0) c.x = s.x + s.w;
        }
      }
      const actual = c.x - before;
      if (Math.abs(actual - dx) > 0.5) p.x += actual - dx;
      if (this.grabSide === 1 && Math.abs(p.x + p.w - c.x) > 14) this.grabbed = null;
      if (this.grabSide === -1 && Math.abs(p.x - (c.x + c.w)) > 14) this.grabbed = null;
    }

    this.moveY(p, p.vy * dt, pSolids, this.gravSign);

    if (p.onGround && this.wasAir) {
      this.audio.land(Math.min(3, Math.abs(this.lastFallVY) / 300));
      if (Math.abs(this.lastFallVY) > 200)
        this.spawnDust(p.x + p.w / 2, this.gravSign > 0 ? p.y + p.h : p.y);
    }
    this.wasAir = !p.onGround;
    this.lastFallVY = p.vy;

    if (p.onGround && Math.abs(p.vx) > 30) {
      this.walkPhase += Math.abs(p.vx) * dt * 0.02;
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.audio.footstep();
        this.stepTimer = running ? 0.24 : 0.34;
      }
      // afterimage trail when running
      if (running && Math.random() < 0.6) {
        this.trail.push({ x: p.x, y: p.y, f: this.facing, a: 0.35 });
        if (this.trail.length > 5) this.trail.shift();
      }
    }
    for (const t of this.trail) t.a -= dt * 1.4;
    this.trail = this.trail.filter((t) => t.a > 0);

    // drowning
    const head =
      this.gravSign > 0
        ? { x: p.x + 4, y: p.y, w: p.w - 8, h: 8 }
        : { x: p.x + 4, y: p.y + p.h - 8, w: p.w - 8, h: 8 };
    if (this.inWater(head)) {
      this.drown += dt;
      if (Math.random() < 0.05) this.spawnBubble(p.x + p.w / 2, p.y);
      if (this.drown > 4.5) this.die("water");
    } else this.drown = Math.max(0, this.drown - dt * 2);

    if (p.y > this.level.groundY + 700 || p.y < -400) this.die("fall");

    this.prevJump = jump;
    this.prevGrab = grabKey;
  }

  private updateSaws(dt: number) {
    for (const s of this.level.saws) {
      s.phase += s.speed * dt;
      s.angle += dt * 14;
    }
  }
  private sawPos(s: { cx: number; cy: number; axis: "x" | "y"; range: number; phase: number }) {
    const off = Math.sin(s.phase) * s.range;
    return s.axis === "x" ? { x: s.cx + off, y: s.cy } : { x: s.cx, y: s.cy + off };
  }

  private distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  private updateBoulders(dt: number) {
    for (const b of this.level.boulders) {
      if (!b.released) {
        if (this.p.x + this.p.w > b.triggerX) {
          b.released = true;
          this.audio.clank();
        }
        continue;
      }
      b.vy += GRAV * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += (b.vx / b.r) * dt;
      for (const s of this.level.solids) {
        if (b.x + b.r > s.x && b.x - b.r < s.x + s.w && b.y + b.r > s.y && b.y - b.r < s.y + s.h) {
          if (b.vy > 0 && b.y < s.y + 20) {
            b.y = s.y - b.r;
            b.vy = 0;
            b.vx = Math.min(b.vx + 200 * dt, 260);
          }
        }
      }
      if (b.y > this.level.groundY + 400) {
        b.released = false;
        b.x = b.startX;
        b.y = b.startY;
        b.vx = 0;
        b.vy = 0;
      }
    }
  }

  private updateRopes(dt: number) {
    for (let i = 0; i < this.level.ropes.length; i++) {
      const rope = this.level.ropes[i];
      if (this.onRope && this.ropeIndex === i) continue;
      rope.angVel += (-9.8 / rope.len) * Math.sin(rope.angle) * dt * 6;
      rope.angVel *= 0.99;
      rope.angle += rope.angVel * dt;
    }
  }

  private updateBearTraps(dt: number) {
    const foot = this.feetRect();
    for (const t of this.level.bearTraps) {
      if (t.hidden && aabb(foot, { x: t.x, y: t.y - 6, w: t.w, h: 16 })) {
        t.hidden = false;
        t.sprung = true;
        this.audio.snap();
        this.die("trap");
      }
      if (t.sprung) t.timer += dt;
    }
  }

  private updateFallingLogs(dt: number) {
    for (const l of this.level.fallingLogs) {
      if (!l.fallen) {
        if (this.p.x + this.p.w > l.triggerX) {
          l.fallen = true;
          this.audio.creak();
        }
        continue;
      }
      l.vy += GRAV * dt;
      l.y += l.vy * dt;
      l.angle += 0.6 * dt;
    }
  }

  private updateSpiders(dt: number) {
    for (const s of this.level.spiders) {
      s.phase += dt;
      if (!s.triggered && Math.abs(this.p.x + this.p.w / 2 - s.x) < 90 && this.p.y > s.ceilingY) {
        s.triggered = true;
        this.audio.spider();
      }
      if (s.triggered && s.y < s.restY + 360) s.y += 230 * dt;
    }
  }

  private updateSparks() {
    const t = performance.now() / 1000;
    for (let i = 0; i < this.level.sparks.length; i++) {
      const s = this.level.sparks[i];
      const active = (t + s.phase) % s.period < s.period * 0.5;
      const was = this.sparkWas.get(i) ?? false;
      if (active && !was) this.audio.spark();
      this.sparkWas.set(i, active);
    }
  }

  private updateMechanisms(dt: number) {
    for (const plate of this.level.plates) {
      let pressed = false;
      const sensor = { x: plate.x, y: plate.y - 6, w: plate.w, h: plate.h + 8 };
      if (aabb(this.p, sensor)) pressed = true;
      for (const c of this.level.crates) if (aabb(c, sensor)) pressed = true;
      for (const c of this.level.cages) if (aabb(c, sensor)) pressed = true;
      if (pressed !== plate.pressed) {
        plate.pressed = pressed;
        this.audio.clank();
      }
    }
    const grabKey = this.keys["e"] || this.keys["k"];
    for (const lv of this.level.levers) {
      if (
        grabKey &&
        !this.prevGrab2 &&
        Math.abs(this.p.x + this.p.w / 2 - lv.x) < 44 &&
        Math.abs(this.p.y + this.p.h - lv.y) < 70
      ) {
        lv.on = !lv.on;
        if (lv.on && lv.timed) lv.timer = lv.timed;
        this.audio.lever();
      }
      if (lv.on && lv.timed && lv.timer != null) {
        lv.timer -= dt;
        if (lv.timer <= 0) {
          lv.on = false;
          lv.timer = undefined;
          this.audio.lever();
        }
      }
    }
    this.prevGrab2 = grabKey;

    for (const c of this.level.conveyors) {
      if (c.link != null) {
        let on = true;
        for (const lv of this.level.levers) if (lv.id === c.link) on = !lv.on; // lever ON kills belt
        c.on = on;
      }
      c.phase += dt * (c.on ? 4 : 0);
    }

    for (const d of this.level.doors) {
      let active = false;
      for (const plate of this.level.plates) if (plate.id === d.link && plate.pressed) active = true;
      for (const lv of this.level.levers) if (lv.id === d.link && lv.on) active = true;
      const targetY = active ? d.yOpen : d.yClosed;
      d.y += (targetY - d.y) * Math.min(1, dt * 4);
      d.open = Math.abs(d.y - d.yOpen) < 6;
    }
  }

  private checkHazards() {
    if (this.dead) return;
    const p = this.p;
    const foot = this.feetRect();
    for (const sp of this.level.spikes) if (aabb(foot, sp)) return this.die("spike");
    for (const s of this.level.saws) {
      const pos = this.sawPos(s);
      if (Math.hypot(p.x + p.w / 2 - pos.x, p.y + p.h / 2 - pos.y) < s.r + 10) return this.die("saw");
    }
    for (const b of this.level.boulders) {
      if (!b.released) continue;
      if (Math.hypot(p.x + p.w / 2 - b.x, p.y + p.h / 2 - b.y) < b.r + 8) return this.die("boulder");
    }
    for (const l of this.level.fallingLogs) {
      if (!l.fallen) continue;
      if (aabb(p, l) && l.vy > 60) return this.die("log");
    }
    for (const s of this.level.spiders) {
      if (!s.triggered) continue;
      if (aabb(p, { x: s.x - 14, y: s.y - 10, w: 28, h: 22 })) return this.die("spider");
    }
    const t = performance.now() / 1000;
    for (const s of this.level.sparks) {
      const active = (t + s.phase) % s.period < s.period * 0.5;
      if (active && aabb(p, s)) return this.die("spark");
    }
  }

  private checkProgress() {
    const p = this.p;
    for (let i = 0; i < this.level.checkpoints.length; i++) {
      const c = this.level.checkpoints[i];
      if (i > this.cpIndex && p.x + p.w / 2 > c.x) {
        this.cpIndex = i;
        this.spawn = { x: c.x, y: c.y };
        this.state.checkpoint = i + 1;
        this.audio.checkpoint();
        this.spawnGlow(c.x, c.y);
        this.emit();
      }
    }
    // whispers
    for (const w of this.level.whispers) {
      if (!w.fired && p.x + p.w / 2 > w.x) {
        w.fired = true;
        this.whisperId++;
        this.state.whisper = { text: w.text, id: this.whisperId };
        this.emit();
      }
    }
    if (aabb(p, this.level.goal) && !this.transitioning && !this.state.won) {
      if (this.level.chapter < 4) {
        this.transitioning = true;
        this.state.transition = CHAPTER_META[this.level.chapter + 1];
        this.audio.chapterGong();
      } else {
        this.state.won = true;
        this.audio.win();
      }
      this.emit();
    }
  }

  // ---------- tutorial state machine ----------
  private tutorialSteps: TutStep[] = [];
  private buildTutorialSteps() {
    const L = this.level;
    this.tutorialSteps = [
      { until: () => this.p.x > 220, button: "right", text: "Hold  ►  to walk into the dark" },
      {
        until: () => this.jumpedFlag,
        button: "jump",
        text: "Tap  JUMP  to cross the thorns",
        world: () => ({ x: 520, y: L.groundY - 90 }),
      },
      {
        until: () => this.grabbed != null,
        button: "grab",
        text: "Stand beside the crate. Hold  GRAB",
        world: () => (L.crates[0] ? { x: L.crates[0].x + 28, y: L.crates[0].y - 30 } : null),
      },
      {
        until: () => !!L.plates[0]?.pressed,
        button: null,
        text: "Drag the crate onto the plate",
        world: () => ({ x: L.plates[0].x + 40, y: L.plates[0].y - 30 }),
      },
      { until: () => this.p.x > 1380, button: "right", text: "The gate remembers — walk through" },
      {
        until: () => this.onRope,
        button: "grab",
        text: "Near the rope, hold  GRAB  to swing",
        world: () => {
          const r = L.ropes[0];
          if (!r) return null;
          return { x: r.px + Math.sin(r.angle) * r.len, y: r.py + Math.cos(r.angle) * r.len - 30 };
        },
      },
      {
        until: () => !this.onRope && this.p.x > 1820,
        button: "jump",
        text: "At the peak — tap  JUMP  to leap off",
      },
      { until: () => this.p.x > 2300, button: "right", text: "Reach the light" },
    ];
  }

  private updateTutorial() {
    if (this.tutorialSteps.length === 0) this.buildTutorialSteps();
    if (this.tutStep >= this.tutorialSteps.length) {
      this.state.tutorial = null;
      return;
    }
    const step = this.tutorialSteps[this.tutStep];
    if (step.until()) this.tutStep++;
    const cur = this.tutorialSteps[this.tutStep];
    this.state.tutorial = cur ? { text: cur.text, button: cur.button } : null;
  }

  private tutorialWorldMarker(): { x: number; y: number } | null {
    if (this.level.chapter !== 0) return null;
    if (this.tutStep >= this.tutorialSteps.length) return null;
    const step = this.tutorialSteps[this.tutStep];
    return step.world ? step.world() : null;
  }

  // ---------- camera ----------
  private updateCamera(dt: number) {
    const p = this.p;
    const tx = p.x + p.w / 2;
    const ty = p.y + p.h / 2 - 40;
    let tz = 1;
    const x = p.x;
    if (this.level.theme === "forest" && x > 1500 && x < 2050) tz = 0.86;
    if (this.level.theme === "ruins" && x > 600 && x < 1150) tz = 0.88;
    if (this.level.theme === "void") tz = 0.92;
    this.targetZoom = tz;
    this.zoom += (this.targetZoom - this.zoom) * Math.min(1, dt * 2.5);
    const viewW = VW / this.zoom;
    let cx = Math.max(viewW / 2, Math.min(this.level.width - viewW / 2, tx));
    let cy = Math.min(this.level.groundY + 80, ty);
    this.camX += (cx - this.camX) * Math.min(1, dt * 4);
    this.camY += (cy - this.camY) * Math.min(1, dt * 4);
  }

  // ---------- particles ----------
  private updateParticles(dt: number) {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.kind !== "leaf" && pt.kind !== "mote") pt.vy += 120 * dt;
      else pt.vy += 12 * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
  private spawnThemeParticles(dt: number) {
    const rate =
      this.level.theme === "forest" ? 0.6 : this.level.theme === "factory" ? 0.5 : this.level.theme === "void" ? 0.7 : 0.25;
    if (Math.random() < rate * dt * 60 * 0.05) {
      const x = this.camX + (Math.random() - 0.5) * VW;
      const y = this.camY - VH / 2 + Math.random() * VH;
      const kind =
        this.level.theme === "forest"
          ? "leaf"
          : this.level.theme === "factory"
          ? "spark"
          : this.level.theme === "void"
          ? "mote"
          : this.level.theme === "ruins"
          ? "ash"
          : "dust";
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 30 + (kind === "leaf" ? 18 : 0),
        vy: kind === "mote" ? -10 - Math.random() * 14 : 12 + Math.random() * 20,
        life: 3 + Math.random() * 3,
        size: 1 + Math.random() * 2,
        kind,
      });
    }
  }
  private spawnDust(x: number, y: number) {
    for (let i = 0; i < 6; i++)
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 90,
        vy: -Math.random() * 60,
        life: 0.4 + Math.random() * 0.3,
        size: 2 + Math.random() * 3,
        kind: "dust",
      });
  }
  private spawnBubble(x: number, y: number) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 14,
      y,
      vx: (Math.random() - 0.5) * 20,
      vy: -40 - Math.random() * 30,
      life: 0.9,
      size: 2 + Math.random() * 2,
      kind: "bubble",
    });
  }
  private spawnGlow(x: number, y: number) {
    for (let i = 0; i < 12; i++)
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 60,
        vy: -Math.random() * 120,
        life: 0.8,
        size: 2 + Math.random() * 2,
        kind: "glow",
      });
  }

  private updateAudioAmbience() {
    const openness = this.p.y < this.level.groundY - 120 ? 1 : 0.4;
    this.audio.setWind(openness);
    let nearest = 9999;
    for (const s of this.level.saws) {
      const pos = this.sawPos(s);
      nearest = Math.min(nearest, Math.hypot(this.p.x - pos.x, this.p.y - pos.y));
    }
    this.audio.setSaw(Math.max(0, 1 - nearest / 350));
    let convNear = 9999;
    for (const c of this.level.conveyors) {
      if (!c.on) continue;
      const d = Math.abs(this.p.x - (c.x + c.w / 2));
      if (d < c.w) convNear = Math.min(convNear, d);
    }
    this.audio.setConveyor(convNear < 200 ? 1 - convNear / 200 : 0);
  }

  // ================= RENDER =================
  private render() {
    const ctx = this.ctx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (this.canvas.width !== Math.floor(cw * dpr) || this.canvas.height !== Math.floor(ch * dpr)) {
      this.canvas.width = Math.floor(cw * dpr);
      this.canvas.height = Math.floor(ch * dpr);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const scale = Math.min(this.canvas.width / VW, this.canvas.height / VH);
    const ox = (this.canvas.width - VW * scale) / 2;
    const oy = (this.canvas.height - VH * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.clearRect(-9999, -9999, 99999, 99999);

    this.drawSky(ctx);
    this.drawParallax(ctx);

    ctx.save();
    ctx.translate(VW / 2, VH / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    this.drawWater(ctx);
    this.drawWorld(ctx);
    this.drawConveyors(ctx);
    this.drawMechanisms(ctx);
    this.drawMagnets(ctx);
    this.drawHazards(ctx);
    this.drawSpiders(ctx);
    this.drawGoal(ctx);
    this.drawPlayer(ctx);
    this.drawTutorialMarker(ctx);
    this.drawParticles(ctx);

    ctx.restore();

    this.drawFog(ctx);
    this.drawVignette(ctx);
  }

  private drawSky(ctx: CanvasRenderingContext2D) {
    const theme = this.level.theme;
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    if (theme === "forest") {
      g.addColorStop(0, "#6f756a");
      g.addColorStop(0.5, "#3c4038");
      g.addColorStop(1, "#0c0d0a");
    } else if (theme === "ruins") {
      g.addColorStop(0, "#7a756c");
      g.addColorStop(0.5, "#3a362f");
      g.addColorStop(1, "#0b0a08");
    } else if (theme === "factory") {
      g.addColorStop(0, "#8a7a66");
      g.addColorStop(0.45, "#3e342a");
      g.addColorStop(1, "#0a0806");
    } else if (theme === "void") {
      g.addColorStop(0, "#1a1a22");
      g.addColorStop(0.5, "#2a2a34");
      g.addColorStop(1, "#060608");
    } else {
      g.addColorStop(0, "#8a8f96");
      g.addColorStop(0.4, "#5f656c");
      g.addColorStop(0.75, "#2c2f33");
      g.addColorStop(1, "#141517");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    // volumetric light shafts
    ctx.save();
    ctx.globalAlpha = theme === "void" ? 0.05 : 0.12;
    for (let i = 0; i < 5; i++) {
      const rx = ((i * 220 - (this.camX * 0.1) % 220) + 220) % (VW + 200) - 100;
      const grd = ctx.createLinearGradient(rx, 0, rx + 120, VH);
      grd.addColorStop(0, "rgba(255,255,255,0.9)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(rx, 0);
      ctx.lineTo(rx + 70, 0);
      ctx.lineTo(rx + 210, VH);
      ctx.lineTo(rx + 120, VH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawParallax(ctx: CanvasRenderingContext2D) {
    const theme = this.level.theme;
    if (theme === "void") {
      // floating shards
      ctx.fillStyle = "#15151b";
      for (let i = 0; i < 24; i++) {
        const bx = ((i * 311 - this.camX * 0.2) % 1400 + 1400) % 1400 - 200;
        const by = ((i * 173) % VH + Math.sin(performance.now() * 0.0003 + i) * 12) % VH;
        const s = 10 + (i % 4) * 8;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(i * 0.7);
        ctx.fillRect(-s / 2, -s / 2, s, s * 0.4);
        ctx.restore();
      }
      return;
    }
    const layers =
      theme === "factory"
        ? [
            { f: 0.18, base: VH * 0.55, col: "#3a3027", step: 260 },
            { f: 0.35, base: VH * 0.7, col: "#241d16", step: 180 },
            { f: 0.55, base: VH * 0.82, col: "#120e0a", step: 120 },
          ]
        : theme === "ruins"
        ? [
            { f: 0.18, base: VH * 0.55, col: "#3a362f", step: 280 },
            { f: 0.35, base: VH * 0.7, col: "#241f1a", step: 200 },
            { f: 0.55, base: VH * 0.82, col: "#100d0a", step: 140 },
          ]
        : [
            { f: 0.15, base: VH * 0.55, col: "#33382e", step: 300 },
            { f: 0.3, base: VH * 0.68, col: "#21261d", step: 220 },
            { f: 0.5, base: VH * 0.8, col: "#10130d", step: 160 },
          ];
    for (const L of layers) {
      ctx.fillStyle = L.col;
      const offset = -this.camX * L.f;
      ctx.beginPath();
      ctx.moveTo(-100, VH);
      for (let x = -100; x < VW + 100; x += L.step) {
        const wx = x - (offset % L.step);
        const h = L.base + Math.sin((x + offset) * 0.01) * 30 + Math.cos((x + offset) * 0.003) * 40;
        ctx.lineTo(wx, h);
        const m = Math.floor((x + offset) / L.step) % 3;
        if (theme === "factory") {
          // pipes / chimneys
          ctx.lineTo(wx + 12, h);
          ctx.lineTo(wx + 12, h - 80 - (m * 20));
          ctx.lineTo(wx + 28, h - 80 - (m * 20));
          ctx.lineTo(wx + 28, h);
        } else if (theme === "ruins") {
          // broken pillars
          if (m === 0) {
            ctx.lineTo(wx + 10, h - 110);
            ctx.lineTo(wx + 26, h - 100);
            ctx.lineTo(wx + 30, h);
          }
        } else {
          // trees
          if (m === 0) {
            ctx.lineTo(wx + 8, h - 90);
            ctx.lineTo(wx + 16, h);
          }
        }
      }
      ctx.lineTo(VW + 100, VH);
      ctx.closePath();
      ctx.fill();
    }
    if (theme === "forest") {
      // hanging vines mid layer
      ctx.strokeStyle = "#0a0c08";
      ctx.lineWidth = 2;
      for (let i = 0; i < 20; i++) {
        const bx = i * 180 - (this.camX * 0.4) % 180;
        ctx.beginPath();
        ctx.moveTo(bx, VH * 0.2);
        ctx.quadraticCurveTo(bx + 6, VH * 0.4, bx + 2, VH * 0.55);
        ctx.stroke();
      }
    }
  }

  private drawWater(ctx: CanvasRenderingContext2D) {
    for (const w of this.level.water) {
      const g = ctx.createLinearGradient(0, w.y, 0, w.y + w.h);
      g.addColorStop(0, "rgba(70,80,90,0.55)");
      g.addColorStop(1, "rgba(15,18,22,0.85)");
      ctx.fillStyle = g;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = "rgba(200,210,220,0.25)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const t = performance.now() * 0.002;
      for (let x = w.x; x < w.x + w.w; x += 8) {
        const y = w.y + Math.sin(x * 0.05 + t) * 2;
        if (x === w.x) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  private drawWorld(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#0a0b0c";
    for (const s of this.level.solids) ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.strokeStyle = "rgba(180,190,200,0.12)";
    ctx.lineWidth = 2;
    for (const s of this.level.solids) {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + 1);
      ctx.lineTo(s.x + s.w, s.y + 1);
      ctx.stroke();
    }
    // invisible platforms as fog shadows
    for (const iv of this.level.invisibles) {
      ctx.save();
      ctx.shadowColor = "rgba(180,190,200,0.35)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "rgba(160,170,180,0.06)";
      ctx.fillRect(iv.x, iv.y, iv.w, iv.h);
      ctx.restore();
      ctx.strokeStyle = "rgba(200,210,220,0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(iv.x + 0.5, iv.y + 0.5, iv.w - 1, iv.h - 1);
    }
    for (const c of this.level.crates) this.drawCrate(ctx, c, false);
    for (const f of this.level.floats) this.drawCrate(ctx, f, true);
    for (const c of this.level.cages) this.drawCage(ctx, c);
  }

  private drawCrate(ctx: CanvasRenderingContext2D, c: Body, wood: boolean) {
    ctx.fillStyle = "#0c0d0e";
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = wood ? "rgba(150,160,170,0.35)" : "rgba(150,160,170,0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
    ctx.beginPath();
    if (!wood) {
      ctx.moveTo(c.x + 2, c.y + 2);
      ctx.lineTo(c.x + c.w - 2, c.y + c.h - 2);
      ctx.moveTo(c.x + c.w - 2, c.y + 2);
      ctx.lineTo(c.x + 2, c.y + c.h - 2);
    } else {
      ctx.moveTo(c.x + 2, c.y + c.h / 2);
      ctx.lineTo(c.x + c.w - 2, c.y + c.h / 2);
    }
    ctx.stroke();
  }

  private drawCage(ctx: CanvasRenderingContext2D, c: Body) {
    ctx.fillStyle = "rgba(8,9,10,0.6)";
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = "rgba(170,180,190,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
    for (let x = c.x + 8; x < c.x + c.w - 4; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, c.y + 2);
      ctx.lineTo(x, c.y + c.h - 2);
      ctx.stroke();
    }
  }

  private drawConveyors(ctx: CanvasRenderingContext2D) {
    for (const c of this.level.conveyors) {
      ctx.fillStyle = c.on ? "#0a0b0c" : "#151618";
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = c.on ? "rgba(200,210,220,0.4)" : "rgba(120,120,120,0.2)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(c.x, c.y, c.w, c.h);
      ctx.clip();
      ctx.strokeStyle = c.on ? "rgba(220,225,230,0.55)" : "rgba(120,120,120,0.25)";
      const off = (c.phase * 14 * c.dir) % 18;
      for (let x = c.x - 18 + off; x < c.x + c.w; x += 18) {
        ctx.beginPath();
        ctx.moveTo(x, c.y + 2);
        ctx.lineTo(x + 6 * c.dir, c.y + c.h / 2);
        ctx.lineTo(x, c.y + c.h - 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawMechanisms(ctx: CanvasRenderingContext2D) {
    for (const pl of this.level.plates) {
      ctx.fillStyle = "#0a0b0c";
      const yy = pl.pressed ? pl.y + 5 : pl.y;
      ctx.fillRect(pl.x, yy, pl.w, pl.h);
      ctx.strokeStyle = "rgba(200,210,220,0.3)";
      ctx.strokeRect(pl.x, yy, pl.w, pl.h);
      ctx.fillStyle = pl.pressed ? "rgba(220,230,240,0.8)" : "rgba(120,130,140,0.4)";
      ctx.fillRect(pl.x + pl.w / 2 - 4, yy - 3, 8, 3);
    }
    for (const lv of this.level.levers) {
      ctx.strokeStyle = "#0a0b0c";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(lv.x, lv.y);
      const angle = lv.on ? -0.7 : 0.7;
      ctx.lineTo(lv.x + Math.sin(angle) * 34, lv.y - Math.cos(angle) * 34);
      ctx.stroke();
      ctx.fillStyle = lv.on ? "rgba(230,240,250,0.9)" : "#1a1c1f";
      ctx.beginPath();
      ctx.arc(lv.x + Math.sin(angle) * 34, lv.y - Math.cos(angle) * 34, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#0a0b0c";
      ctx.fillRect(lv.x - 6, lv.y, 12, 10);
    }
    for (const d of this.level.doors) {
      ctx.fillStyle = "#0a0b0c";
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = "rgba(160,170,180,0.25)";
      ctx.lineWidth = 2;
      for (let yy = d.y + 10; yy < d.y + d.h; yy += 16) {
        ctx.beginPath();
        ctx.moveTo(d.x, yy);
        ctx.lineTo(d.x + d.w, yy);
        ctx.stroke();
      }
    }
    for (const pl of this.level.platforms) {
      ctx.fillStyle = "#0a0b0c";
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.strokeStyle = "rgba(180,190,200,0.3)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pl.x + 1, pl.y + 1, pl.w - 2, pl.h - 2);
      for (let xx = pl.x + 8; xx < pl.x + pl.w - 4; xx += 14) {
        ctx.beginPath();
        ctx.arc(xx, pl.y + pl.h / 2, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(180,190,200,0.4)";
        ctx.fill();
      }
    }
    for (const rope of this.level.ropes) {
      const ex = rope.px + Math.sin(rope.angle) * rope.len;
      const ey = rope.py + Math.cos(rope.angle) * rope.len;
      ctx.strokeStyle = "#0a0b0c";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rope.px, rope.py);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.fillStyle = "#0a0b0c";
      ctx.beginPath();
      ctx.arc(ex, ey, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(rope.px - 6, rope.py - 6, 12, 8);
    }
  }

  private drawMagnets(ctx: CanvasRenderingContext2D) {
    const t = performance.now() * 0.003;
    for (const m of this.level.magnets) {
      const hostile = m.strength < 0;
      // field rings
      for (let i = 0; i < 3; i++) {
        const rr = (m.r * (0.3 + i * 0.25) + Math.sin(t + i) * 4);
        ctx.strokeStyle = `rgba(${hostile ? "220,80,80" : "200,210,220"},${0.18 - i * 0.04})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      // core device
      ctx.fillStyle = "#0a0b0c";
      ctx.fillRect(m.x - 14, m.y - 10, 28, 20);
      ctx.fillStyle = hostile ? "rgba(220,60,60,0.8)" : "rgba(220,230,240,0.8)";
      ctx.fillRect(m.x - 10, m.y - 3, 20, 6);
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D) {
    // spikes
    ctx.fillStyle = "#0a0b0c";
    for (const sp of this.level.spikes) {
      const n = Math.max(1, Math.floor(sp.w / 18));
      const bw = sp.w / n;
      for (let i = 0; i < n; i++) {
        const x = sp.x + i * bw;
        ctx.beginPath();
        ctx.moveTo(x, sp.y + sp.h);
        ctx.lineTo(x + bw / 2, sp.y - 6);
        ctx.lineTo(x + bw, sp.y + sp.h);
        ctx.closePath();
        ctx.fill();
      }
    }
    // bear traps
    for (const t of this.level.bearTraps) {
      if (t.hidden) {
        ctx.fillStyle = "rgba(20,18,14,0.6)";
        ctx.beginPath();
        ctx.ellipse(t.x + t.w / 2, t.y + 4, t.w / 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        // a couple of leaf hints
        ctx.fillStyle = "rgba(40,50,35,0.5)";
        ctx.fillRect(t.x + 4, t.y, 6, 3);
        ctx.fillRect(t.x + t.w - 12, t.y + 1, 6, 3);
      } else {
        ctx.strokeStyle = "#0a0b0c";
        ctx.lineWidth = 3;
        const open = Math.min(1, t.timer * 6);
        const ang = 0.3 + open * 1.0;
        ctx.beginPath();
        ctx.arc(t.x + t.w / 2, t.y + 8, t.w / 2, Math.PI + ang, Math.PI * 2 - ang);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(t.x + t.w / 2, t.y + 8, t.w / 2, ang, Math.PI - ang);
        ctx.stroke();
        // teeth
        ctx.fillStyle = "#0a0b0c";
        for (let i = 0; i < 5; i++) {
          const a = (i / 4) * Math.PI;
          const rx = t.x + t.w / 2 + Math.cos(a) * (t.w / 2);
          const ry = t.y + 8 - Math.sin(a) * (t.w / 2);
          ctx.fillRect(rx - 1, ry - 4, 2, 4);
          ctx.fillRect(rx - 1, ry + 8, 2, 4);
        }
      }
    }
    // falling logs
    for (const l of this.level.fallingLogs) {
      ctx.save();
      ctx.translate(l.x + l.w / 2, l.y + l.h / 2);
      ctx.rotate(l.angle);
      ctx.fillStyle = "#0a0b0c";
      ctx.fillRect(-l.w / 2, -l.h / 2, l.w, l.h);
      ctx.strokeStyle = "rgba(170,150,120,0.25)";
      ctx.lineWidth = 1;
      for (let i = -l.w / 2 + 6; i < l.w / 2; i += 10) {
        ctx.beginPath();
        ctx.moveTo(i, -l.h / 2 + 2);
        ctx.lineTo(i, l.h / 2 - 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    // saws
    for (const s of this.level.saws) {
      const pos = this.sawPos(s);
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(s.angle);
      ctx.fillStyle = "#0a0b0c";
      const teeth = 12;
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        const a0 = (i / teeth) * Math.PI * 2;
        const a1 = ((i + 0.5) / teeth) * Math.PI * 2;
        ctx.lineTo(Math.cos(a0) * s.r, Math.sin(a0) * s.r);
        ctx.lineTo(Math.cos(a1) * s.r * 0.78, Math.sin(a1) * s.r * 0.78);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(210,220,230,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, s.r * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // boulders
    for (const b of this.level.boulders) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = "#0a0b0c";
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // sparks
    const t = performance.now() / 1000;
    for (const s of this.level.sparks) {
      const active = (t + s.phase) % s.period < s.period * 0.5;
      ctx.fillStyle = "#0a0b0c";
      ctx.fillRect(s.x, s.y, s.w, 10);
      ctx.fillRect(s.x, s.y + s.h - 10, s.w, 10);
      if (active) {
        ctx.save();
        ctx.shadowColor = "rgba(240,250,255,0.95)";
        ctx.shadowBlur = 22;
        ctx.strokeStyle = "rgba(245,250,255,0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const segs = 6;
        for (let i = 0; i <= segs; i++) {
          const yy = s.y + 10 + ((s.h - 20) * i) / segs;
          const xx = s.x + s.w / 2 + (Math.random() - 0.5) * 18;
          if (i === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.strokeStyle = "rgba(180,190,200,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x + s.w / 2, s.y + 10);
        ctx.lineTo(s.x + s.w / 2, s.y + s.h - 10);
        ctx.stroke();
      }
    }
  }

  private drawSpiders(ctx: CanvasRenderingContext2D) {
    for (const s of this.level.spiders) {
      ctx.strokeStyle = "rgba(10,10,10,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.ceilingY);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
      ctx.fillStyle = "#0a0b0c";
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 12, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      // legs
      ctx.strokeStyle = "#0a0b0c";
      ctx.lineWidth = 1.5;
      const wig = Math.sin(s.phase * 8) * 3;
      for (let i = 0; i < 4; i++) {
        const a = (i / 3) * Math.PI - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x + Math.cos(a) * 14, s.y + Math.sin(a) * 10 + wig);
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - Math.cos(a) * 14, s.y + Math.sin(a) * 10 - wig);
        ctx.stroke();
      }
      // tiny eyes
      ctx.fillStyle = "rgba(220,40,40,0.9)";
      ctx.fillRect(s.x - 3, s.y - 2, 2, 2);
      ctx.fillRect(s.x + 1, s.y - 2, 2, 2);
    }
  }

  private drawGoal(ctx: CanvasRenderingContext2D) {
    const g = this.level.goal;
    const grd = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
    grd.addColorStop(0, "rgba(255,255,255,0.85)");
    grd.addColorStop(1, "rgba(255,255,255,0.15)");
    ctx.fillStyle = grd;
    ctx.save();
    ctx.shadowColor = "rgba(255,255,255,0.8)";
    ctx.shadowBlur = 40;
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.restore();
    ctx.strokeStyle = "#0a0b0c";
    ctx.lineWidth = 6;
    ctx.strokeRect(g.x - 3, g.y - 3, g.w + 6, g.h + 6);
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    if (this.dead) {
      ctx.fillStyle = "#0a0b0c";
      for (const r of this.ragdoll) {
        ctx.globalAlpha = Math.max(0, r.life);
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    // afterimage trail
    for (const t of this.trail) {
      ctx.globalAlpha = Math.max(0, t.a) * 0.5;
      this.drawSilhouette(ctx, t.x + this.p.w / 2, t.y, t.f, 1, 0);
    }
    ctx.globalAlpha = 1;
    const bob =
      this.p.onGround && Math.abs(this.p.vx) > 20 ? Math.sin(this.walkPhase) * 1.5 : Math.sin(performance.now() * 0.004) * 0.6;
    const originY = this.gravSign > 0 ? this.p.y + bob : this.p.y + this.p.h - bob;
    this.drawSilhouette(ctx, this.p.x + this.p.w / 2, originY, this.facing, this.gravSign, 1);
  }

  private drawSilhouette(
    ctx: CanvasRenderingContext2D,
    cx: number,
    originY: number,
    facing: number,
    scaleY: number,
    alpha: number,
  ) {
    const p = this.p;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, originY);
    ctx.scale(facing, scaleY);
    // scarf trailing with velocity
    ctx.fillStyle = "#050506";
    ctx.beginPath();
    const trail = Math.max(-14, Math.min(14, -p.vx * 0.04));
    ctx.moveTo(-4, 6);
    ctx.quadraticCurveTo(-12 + trail, 14, -16 + trail * 1.4, 22);
    ctx.quadraticCurveTo(-10 + trail, 16, -4, 12);
    ctx.closePath();
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.moveTo(-6, p.h);
    ctx.lineTo(-7, 16);
    ctx.quadraticCurveTo(-9, 4, 0, 2);
    ctx.quadraticCurveTo(9, 4, 7, 16);
    ctx.lineTo(6, p.h);
    ctx.closePath();
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(0, -2, 8, 0, Math.PI * 2);
    ctx.fill();
    // legs
    const swing = p.onGround && Math.abs(p.vx) > 20 ? Math.sin(this.walkPhase) * 8 : 3;
    ctx.strokeStyle = "#050506";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-2, p.h - 12);
    ctx.lineTo(-2 + swing, p.h);
    ctx.moveTo(2, p.h - 12);
    ctx.lineTo(2 - swing, p.h);
    ctx.stroke();
    // arms (slight swing)
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(4 - swing * 0.4, 24);
    ctx.moveTo(0, 12);
    ctx.lineTo(-4 + swing * 0.4, 24);
    ctx.stroke();
    if (alpha >= 0.9) {
      // RED EYES with bloom
      ctx.fillStyle = "rgba(220,20,20,0.98)";
      ctx.save();
      ctx.shadowColor = "rgba(255,30,30,0.95)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(2.5, -3, 1.8, 0, Math.PI * 2);
      ctx.arc(6, -3, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawTutorialMarker(ctx: CanvasRenderingContext2D) {
    const m = this.tutorialWorldMarker();
    if (!m) return;
    const t = performance.now() * 0.005;
    const pulse = 0.6 + Math.sin(t) * 0.4;
    ctx.save();
    ctx.strokeStyle = `rgba(220,40,40,${0.4 + pulse * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 16 + pulse * 8, 0, Math.PI * 2);
    ctx.stroke();
    // chevron down
    ctx.fillStyle = `rgba(220,40,40,${0.7})`;
    ctx.beginPath();
    ctx.moveTo(m.x - 6, m.y - 26);
    ctx.lineTo(m.x + 6, m.y - 26);
    ctx.lineTo(m.x, m.y - 18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const pt of this.particles) {
      const a = Math.max(0, Math.min(1, pt.life / 2));
      if (pt.kind === "spark") {
        ctx.fillStyle = `rgba(255,220,160,${a * 0.8})`;
      } else if (pt.kind === "leaf") {
        ctx.fillStyle = `rgba(30,35,25,${a * 0.7})`;
      } else if (pt.kind === "mote") {
        ctx.fillStyle = `rgba(220,220,235,${a * 0.5})`;
      } else if (pt.kind === "ash") {
        ctx.fillStyle = `rgba(180,180,180,${a * 0.4})`;
      } else if (pt.kind === "glow") {
        ctx.fillStyle = `rgba(240,245,255,${a})`;
      } else {
        ctx.fillStyle = `rgba(200,210,220,${a * 0.6})`;
      }
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFog(ctx: CanvasRenderingContext2D) {
    const t = performance.now() * 0.00004;
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const y = VH * (0.6 + i * 0.13);
      const g = ctx.createLinearGradient(0, y - 60, 0, y + 60);
      const tint =
        this.level.theme === "forest"
          ? "60,70,55"
          : this.level.theme === "ruins"
          ? "80,72,60"
          : this.level.theme === "factory"
          ? "90,75,55"
          : this.level.theme === "void"
          ? "50,50,70"
          : "150,158,166";
      g.addColorStop(0, `rgba(${tint},0)`);
      g.addColorStop(0.5, `rgba(${tint},${0.12 - i * 0.02})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = g;
      const shift = Math.sin(t * 1000 + i) * 20;
      ctx.fillRect(-50 + shift, y - 60, VW + 100, 120);
    }
    ctx.restore();
  }

  private drawVignette(ctx: CanvasRenderingContext2D) {
    const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.85);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.78)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }
}
