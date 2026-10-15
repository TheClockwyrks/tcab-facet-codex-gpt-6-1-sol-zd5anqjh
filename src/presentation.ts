import type { InitApi, UpdateApi, RenderApi } from "@clockwyrks/simple-2d";
import {
  ParticleSimulator,
  type ParticleSystem,
} from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import type { FacetState, GemState } from "./game";
import { debug, snapshot } from "./debug";
import { back, choose, menuItems, pause, pointer, targets } from "./controls";
import {
  advance,
  cellX,
  cellY,
  index,
  initial,
  landAt,
  motion,
  type EventName,
  type PlayState,
} from "./simulation";
interface Art {
  readonly images: Record<string, ImageBitmap>;
  readonly fx: Record<string, ParticleSystem>;
}
// Only decoded assets live outside the state. Simulations and animation clocks do not.
let art: Art = { images: {}, fx: {} };
export async function initialize(
  api: InitApi<FacetState>,
): Promise<[FacetState, typeof debug]> {
  for (const name of C.ACTIONS)
    api.input.register(name, { keys: [...C.BINDINGS[name]] });
  const paths: string[] = [
    "gems/frame.png",
    "gems/brilliant.png",
    "gems/star.png",
  ];
  for (const kind of [...C.GEM_KINDS, "prism"])
    for (let n = 0; n <= C.MAX_STRAIN; n++) paths.push(`gems/${kind}-${n}.png`);
  for (const kind of C.GEM_KINDS)
    for (let f = 0; f < 6; f++) paths.push(`gems/break/${kind}/${f}.png`);
  for (let f = 0; f < 8; f++) paths.push(`gems/prism-turn/${f}.png`);
  const images: Record<string, ImageBitmap> = {};
  const fx: Record<string, ParticleSystem> = {};
  await Promise.all([
    ...paths.map(async (path) => {
      images[path] = await api.assets.loadImage(path);
    }),
    ...["clear", "flawed", "cut", "aura"].map(async (name) => {
      fx[name] = JSON.parse(
        await (await api.assets.load(`fx/${name}/system.json`)).text(),
      ) as ParticleSystem;
    }),
    ...Object.values(C.CUES).map((name) =>
      api.audio.load(name, `audio/${name}.wav`),
    ),
    ...["title", "play"].map((name) =>
      api.audio.load(name, `audio/${name}.wav`),
    ),
    ...Array.from({ length: C.MAX_MULTIPLIER }, (_, i) =>
      api.audio.load(`ladder-${i + 1}`, `audio/clear-${i + 1}.wav`),
    ),
    api.assets.loadAudio("audio/shatter.wav"),
  ]);
  art = { images, fx };
  for (const name of [
    "screen",
    "phase",
    "score",
    "level",
    "levelScore",
    "chainStep",
    "multiplier",
    "lastCleared",
    "lastPoints",
    "lastWaves",
    "lastFall",
    "bestMove",
    "bestChain",
    "legalSwap",
  ] as const)
    api.diagnostics.register(name, (s) => snapshot(s)[name]);
  api.diagnostics.register("board", (s) => `${s.board.cols} × ${s.board.rows}`);
  api.diagnostics.register(
    "target",
    (s) => `${s.levelScore} / ${s.level * C.LEVEL_TARGET_STEP}`,
  );
  api.diagnostics.register("selection", (s) =>
    s.selection ? `${s.selection.col}, ${s.selection.row}` : "none",
  );
  api.diagnostics.register("offer", (s) =>
    s.offer ? `${s.offer.col}, ${s.offer.row}` : "none",
  );
  api.diagnostics.register(
    "pointer",
    (s) =>
      `${s.pointer.x.toFixed(0)}, ${s.pointer.y.toFixed(0)} ${s.pointer.device}`,
  );
  return [initial(), debug];
}
export function update(
  state: FacetState,
  api: UpdateApi,
  dt: number,
): FacetState {
  let s: PlayState = { ...state, simTime: state.simTime + dt };
  const events = new Set<EventName>();
  const oldScreen = s.screen;
  const observe = (before: PlayState, after: PlayState) => {
    if (before.selection !== after.selection && after.selection)
      events.add("select");
    if (before.phase !== "swapping" && after.phase === "swapping")
      events.add("swap");
    if (before.refusal !== after.refusal && after.refusal?.timer === 0)
      events.add("refuse");
    return after;
  };
  for (const sample of api.input.pointerSamples()) {
    if (!sample.primary) continue;
    s = observe(
      s,
      pointer(
        s,
        sample.type === "down" ? "down" : sample.type === "up" ? "up" : "move",
        sample.x,
        sample.y,
        sample.device,
      ),
    );
  }
  s = { ...s, pointer: api.input.pointer() };
  const actions = Object.fromEntries(
    C.ACTIONS.map((name) => [name, api.input.pressed(name)]),
  );
  if (actions.mute) api.audio.setMuted(!api.audio.muted());
  s = { ...s, muted: api.audio.muted() };
  const count = menuItems(s.screen).length;
  if (count && (actions.up || actions.down))
    s = {
      ...s,
      menuIndex: (s.menuIndex + (actions.down ? 1 : -1) + count) % count,
    };
  if (actions.confirm && count) s = choose(s);
  if (actions.pause && (oldScreen === "playing" || oldScreen === "paused"))
    s = pause(s);
  else if (actions.back) s = back(s);
  if (oldScreen === s.screen) s = advance(s, dt, events);
  for (const event of events) {
    api.audio.play(C.CUES[event]);
    if (event === "clear") {
      api.audio.play(`ladder-${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`);
    }
  }
  const theme = s.screen === "title" || s.screen === "howto" ? "title" : "play";
  const other = theme === "title" ? "play" : "title";
  if (api.audio.looping(other)) api.audio.stop(other);
  api.audio.loop(theme);
  return s;
}
const ink = "#edf3e9",
  gold = "#d9c48d",
  muted = "#809b9e";
function text(
  c: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = ink,
  font = "sans-serif",
  align: CanvasTextAlign = "left",
) {
  c.fillStyle = color;
  c.font = `${size}px ${font === "Georgia" ? "Georgia, serif" : font}`;
  c.textAlign = align;
  c.fillText(value, x, y);
}
function line(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = "#29434b",
) {
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x2, y2);
  c.stroke();
}
function gem(
  c: CanvasRenderingContext2D,
  g: GemState,
  x: number,
  y: number,
  time: number,
  scale = 1,
) {
  let key = `gems/${g.kind ?? "prism"}-${g.strain}.png`;
  if (g.cut === "prism")
    key = `gems/prism-turn/${Math.floor(time * 7) % 8}.png`;
  const img = art.images[key];
  if (!img) return;
  c.drawImage(img, x - 32 * scale, y - 32 * scale, 64 * scale, 64 * scale);
  if (g.cut === "prism" && g.strain > 0) {
    c.save();
    c.globalAlpha = 0.7;
    c.drawImage(
      art.images[`gems/prism-${g.strain}.png`],
      x - 32 * scale,
      y - 32 * scale,
      64 * scale,
      64 * scale,
    );
    c.restore();
  }
  if (g.cut === "brilliant" || g.cut === "star")
    c.drawImage(
      art.images[`gems/${g.cut}.png`],
      x - 32 * scale,
      y - 32 * scale,
      64 * scale,
      64 * scale,
    );
}
function particles(
  c: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
) {
  if (age < 0 || age > 1.6 || !art.fx[name]) return;
  const sim = new ParticleSimulator(art.fx[name], { seed });
  for (let t = 0; t < age; t += 1 / 60)
    sim.step(Math.min(1 / 60, age - t) * 1000);
  c.save();
  c.globalCompositeOperation = "lighter";
  for (const p of sim.capture()) {
    const [r, g, b] = p.color;
    c.fillStyle = `rgba(${Math.floor(r * 255)},${Math.floor(g * 255)},${Math.floor(b * 255)},${p.opacity})`;
    const size = p.size * 2;
    c.fillRect(
      x + p.position[0] - size / 2,
      y - p.position[1] - size / 2,
      size,
      size,
    );
  }
  c.restore();
}
function field(c: CanvasRenderingContext2D) {
  const bg = c.createRadialGradient(650, 340, 40, 640, 360, 850);
  bg.addColorStop(0, "#15313a");
  bg.addColorStop(0.6, "#0b1d26");
  bg.addColorStop(1, "#061019");
  c.fillStyle = bg;
  c.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  c.strokeStyle = "#1a3038";
  c.lineWidth = 1;
  for (let i = -5; i < 14; i++) {
    c.beginPath();
    c.moveTo(i * 160, -100);
    c.lineTo(i * 160 + 520, 820);
    c.stroke();
  }
  line(c, 46, 34, 46, 686);
  line(c, 1234, 34, 1234, 686);
  for (const x of [46, 1234]) {
    c.fillStyle = gold;
    c.fillRect(x - 2, 33, 5, 5);
    c.fillRect(x - 2, 682, 5, 5);
  }
  text(c, "A STUDY IN PRESSURE", 76, 51, 11, muted);
}
function button(
  c: CanvasRenderingContext2D,
  t: ReturnType<typeof targets>[number],
  label: string,
  selected: boolean,
) {
  c.fillStyle = selected ? "#d9c48d" : "#112832";
  c.fillRect(t.x, t.y, t.w, t.h);
  c.strokeStyle = selected ? "#fff0c9" : "#3b5358";
  c.lineWidth = 1;
  c.strokeRect(t.x + 0.5, t.y + 0.5, t.w - 1, t.h - 1);
  text(c, label, t.x + 28, t.y + 44, 17, selected ? "#12212a" : ink);
  text(
    c,
    selected ? "→" : "·",
    t.x + t.w - 28,
    t.y + 44,
    20,
    selected ? "#12212a" : muted,
    "sans-serif",
    "right",
  );
}
function board(c: CanvasRenderingContext2D, s: PlayState) {
  const m = motion(s);
  c.save();
  c.shadowColor = "#0009";
  c.shadowBlur = 26;
  c.shadowOffsetY = 15;
  const frame = art.images["gems/frame.png"];
  c.drawImage(
    frame,
    C.BOARD_CX - frame.width / 2,
    C.BOARD_CY - frame.height / 2,
  );
  c.restore();
  c.save();
  c.beginPath();
  c.rect(
    cellX(0) - C.CELL_PITCH / 2,
    cellY(0) - C.CELL_PITCH / 2,
    C.GRID_COLS * C.CELL_PITCH,
    C.GRID_ROWS * C.CELL_PITCH,
  );
  c.clip();
  for (const g of s.board.cells) {
    let x = cellX(g.col),
      y = cellY(g.row);
    if (s.phase === "swapping" && m.swap) {
      const other = m.swap.find((p) => index(p) !== index(g));
      if (m.swap.some((p) => index(p) === index(g)) && other) {
        const t = 1 - s.swapTimer / C.SWAP_SECONDS;
        x += (cellX(other.col) - x) * t;
        y += (cellY(other.row) - y) * t;
      }
    } else if (s.offer && s.selection) {
      if (index(g) === index(s.selection)) {
        x = cellX(s.offer.col);
        y = cellY(s.offer.row);
      } else if (index(g) === index(s.offer)) {
        x = cellX(s.selection.col);
        y = cellY(s.selection.row);
      }
    }
    if (s.phase === "resolving") {
      const falling = Math.max(0, s.stepTimer - s.lastWaves * C.WAVE_SECONDS);
      y -=
        Math.max(0, g.fell - falling / C.FALL_SECONDS_PER_ROW) * C.CELL_PITCH;
    } else if (s.phase === "idle" && s.simTime - m.openingAt < 0.65) {
      y -=
        g.fell *
        C.CELL_PITCH *
        Math.max(0, 1 - (s.simTime - m.openingAt) / 0.65) ** 2;
    }
    if (g.cut !== "plain")
      particles(c, "aura", x, y, (s.simTime % 1.1) + 0.15, index(g) + 9);
    gem(c, g, x, y, s.simTime);
  }
  if (s.phase === "resolving") {
    for (const { gem: g, wave } of m.cleared) {
      const age = s.stepTimer - wave * C.WAVE_SECONDS;
      if (age < 0) gem(c, g, cellX(g.col), cellY(g.row), s.simTime);
      else {
        if (age < 0.25 && g.kind) {
          const f = Math.min(5, Math.floor(age / 0.042));
          c.drawImage(
            art.images[`gems/break/${g.kind}/${f}.png`],
            cellX(g.col) - 32,
            cellY(g.row) - 32,
          );
        }
        particles(
          c,
          g.strain === C.MAX_STRAIN ? "flawed" : "clear",
          cellX(g.col),
          cellY(g.row),
          age,
          index(g) + s.chainStep * 73,
        );
      }
    }
    for (const p of m.created)
      particles(
        c,
        "cut",
        cellX(p.col),
        cellY(p.row),
        s.stepTimer - landAt(s),
        index(p) + 192,
      );
  }
  c.restore();
  for (const [p, color] of [
    [s.selection, gold],
    [s.refusal?.a, "#f68d91"],
    [s.refusal?.b, "#f68d91"],
  ] as const) {
    if (!p) continue;
    c.strokeStyle = color;
    c.lineWidth = 2;
    c.strokeRect(cellX(p.col) - 33, cellY(p.row) - 33, 66, 66);
  }
}
function hud(c: CanvasRenderingContext2D, s: PlayState) {
  text(c, C.TITLE_TEXT, 76, 111, 30, gold, "Georgia");
  text(c, C.HUD_SCORE_LABEL, 76, 190, 12, muted);
  text(c, s.score.toLocaleString(), 76, 231, 38, ink, "Georgia");
  line(c, 76, 257, 274, 257);
  text(c, C.HUD_LEVEL_LABEL, 76, 300, 12, muted);
  text(c, String(s.level).padStart(2, "0"), 76, 345, 40, ink, "Georgia");
  text(c, "TARGET", 76, 391, 11, muted);
  text(
    c,
    `${s.levelScore.toLocaleString()} / ${(C.LEVEL_TARGET_STEP * s.level).toLocaleString()}`,
    76,
    417,
    17,
    gold,
  );
  c.fillStyle = "#29424a";
  c.fillRect(76, 438, 198, 4);
  c.fillStyle = gold;
  c.fillRect(
    76,
    438,
    198 * Math.min(1, s.levelScore / (C.LEVEL_TARGET_STEP * s.level)),
    4,
  );
  text(c, "EVERY CLEAR", 76, 532, 11, muted);
  text(c, "LEAVES A MARK.", 76, 551, 11, muted);
  text(c, "Drag a gem to its neighbor.", 76, 603, 13, ink);
  text(c, "Release to make your move.", 76, 624, 13, muted);
  text(c, "01 — THE LAPIDARY’S BENCH", 354, 73, 11, gold);
  text(
    c,
    s.phase === "resolving" ? "RESOLVING" : "FIND YOUR NEXT FRACTURE",
    928,
    73,
    10,
    muted,
    "sans-serif",
    "right",
  );
  text(c, "STRAIN", 995, 213, 12, gold);
  for (let i = 0; i < 4; i++) {
    gem(
      c,
      { col: 0, row: 0, kind: "ruby", cut: "plain", strain: i, fell: 0 },
      1014,
      251 + i * 73,
      s.simTime,
      0.64,
    );
    text(
      c,
      ["CLEAN", "HAIRLINE", "FRACTURED", "FLAWED"][i],
      1047,
      256 + i * 73,
      11,
      i === 3 ? gold : muted,
    );
  }
  line(c, 995, 525, 1203, 525);
  text(c, "Flawed stones shatter", 995, 556, 13, ink);
  text(c, "with a neighboring clear.", 995, 578, 13, muted);
  text(c, "DOUBLE THE VALUE.", 995, 610, 11, gold);
  if (s.phase === "resolving") {
    text(c, C.HUD_CHAIN_LABEL, 1020, 106, 11, gold);
    text(
      c,
      `×${Math.min(s.chainStep, C.MAX_MULTIPLIER)}`,
      1020,
      157,
      42,
      ink,
      "Georgia",
    );
    text(c, `+${s.lastPoints}`, 1197, 157, 24, gold, "Georgia", "right");
  }
  for (const t of targets(s)) button(c, t, C.PAUSE_LABEL, false);
}
function title(c: CanvasRenderingContext2D, s: PlayState) {
  text(c, "THE ART OF THE CHAIN", 122, 163, 12, gold);
  text(c, C.TITLE_TEXT, 114, 292, 112, ink, "Georgia");
  line(c, 122, 324, 480, 324, gold);
  text(c, C.TAGLINE_TEXT, 122, 362, 16, gold);
  for (const t of targets(s))
    button(
      c,
      t,
      menuItems(s.screen)[Number(t.id.slice(5))],
      s.menuIndex === Number(t.id.slice(5)),
    );
  text(c, "SWAP  /  SHATTER  /  SET THE CHAIN IN MOTION", 122, 638, 10, muted);
  const gems = [
    { i: 0, x: 824, y: 224, z: 2.3 },
    { i: 4, x: 1018, y: 357, z: 1.65 },
    { i: 6, x: 742, y: 459, z: 1.65 },
    { i: 2, x: 965, y: 550, z: 0.95 },
  ];
  for (const { i, x, y, z } of gems) {
    c.save();
    c.shadowColor = ["#fb6277", "#53d8dd", "#ae80ef", "#e9cb57"][
      gems.findIndex((g) => g.i === i)
    ];
    c.shadowBlur = 36;
    c.globalAlpha = 0.18;
    c.beginPath();
    c.arc(x, y, 46 * z, 0, Math.PI * 2);
    c.fillStyle = c.shadowColor;
    c.fill();
    c.restore();
    gem(
      c,
      {
        col: 0,
        row: 0,
        kind: C.GEM_KINDS[i],
        strain: i === 6 ? 3 : 0,
        cut: "plain",
        fell: 0,
      },
      x,
      y + Math.sin(s.simTime * 0.7 + i) * 7,
      s.simTime,
      z,
    );
  }
  line(c, 744, 319, 999, 496);
  line(c, 783, 170, 1083, 452);
  text(c, "CUT WITH INTENTION.", 740, 647, 13, gold);
  text(
    c,
    "A gem-matching puzzle of beautiful consequences.",
    740,
    672,
    12,
    muted,
  );
}
const help = [
  [
    "01",
    "MAKE A MATCH",
    "Seven kinds of stone. Hold a gem with your mouse, pen, or finger,",
    "carry it onto a neighbor, then release. Three or more in a line shatter.",
    "Carry it back to cancel. A move that clears nothing is refused.",
  ],
  [
    "02",
    "BUILD THE PRESSURE",
    "Each clear strains the stones beside it. Three marks leave a flaw.",
    "A flawed stone joins any clear touching it — and scores double.",
    "Falling stones can match again. Each chain step raises the multiplier.",
  ],
  [
    "03",
    "EARN A FINER CUT",
    "Four in a line leave a brilliant: it clears the surrounding ring.",
    "Five or more leave a prism: swap it to clear every gem of one kind.",
    "Crossing lines leave a star: it clears its whole row and column.",
  ],
];
function howto(c: CanvasRenderingContext2D, s: PlayState) {
  text(c, "A SMALL GUIDE TO", 76, 110, 12, gold);
  text(c, "Beautiful consequences.", 76, 164, 47, ink, "Georgia");
  help.forEach(([n, title, ...lines], i) => {
    const y = 230 + i * 113;
    text(c, n, 76, y, 21, gold, "Georgia");
    text(c, title, 129, y, 14, gold);
    lines.forEach((t, j) =>
      text(c, t, 129, y + 26 + j * 21, 14, j === 0 ? ink : muted),
    );
  });
  line(c, 860, 216, 860, 559);
  text(c, "THE AIM", 917, 242, 12, gold);
  text(c, "Reach the level target.", 917, 276, 17, ink);
  text(c, "Then start a fresh board.", 917, 301, 15, muted);
  text(c, "The round ends when", 917, 351, 15, ink);
  text(c, "no productive move remains.", 917, 376, 15, muted);
  text(c, "KEYS AT YOUR FINGERTIPS", 917, 440, 11, gold);
  [
    "↑ ↓   Navigate menus",
    "Enter / Space   Choose",
    "Esc / P   Pause or resume",
    "M   Mute all sound",
    "Esc   Back from this guide",
  ].forEach((v, i) => text(c, v, 917, 471 + i * 25, 13, muted));
  for (const t of targets(s)) button(c, t, C.BACK_LABEL, false);
}
export function render(state: FacetState, api: RenderApi): void {
  const s: PlayState = state,
    c = api.ctx;
  c.imageSmoothingEnabled = false;
  field(c);
  if (s.screen === "title") title(c, s);
  else if (s.screen === "howto") howto(c, s);
  else {
    board(c, s);
    hud(c, s);
    if (s.screen !== "playing") {
      c.fillStyle = "#06121ad9";
      c.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
      c.fillStyle = "#102630";
      c.fillRect(400, 164, 480, 470);
      c.strokeStyle = "#52615a";
      c.strokeRect(400.5, 164.5, 479, 469);
      text(
        c,
        s.screen === "paused"
          ? "TAKE A BREATH"
          : s.screen === "levelclear"
            ? "A LITTLE MORE BRILLIANT"
            : "EVERY STONE HAS ITS LIMIT",
        C.STAGE_CX,
        215,
        11,
        gold,
        "sans-serif",
        "center",
      );
      text(
        c,
        s.screen === "paused"
          ? C.PAUSED_TITLE_TEXT
          : s.screen === "levelclear"
            ? C.LEVELCLEAR_TITLE_TEXT
            : C.GAMEOVER_TITLE_TEXT,
        C.STAGE_CX,
        279,
        38,
        ink,
        "Georgia",
        "center",
      );
      if (s.screen === "levelclear") {
        text(
          c,
          `${C.HUD_LEVEL_LABEL} ${s.level}`,
          C.STAGE_CX,
          319,
          13,
          gold,
          "sans-serif",
          "center",
        );
        text(
          c,
          `${C.BEST_CHAIN_LABEL}  ${s.bestChain}     /     ${C.BEST_MOVE_LABEL}  ${s.bestMove}`,
          C.STAGE_CX,
          367,
          12,
          muted,
          "sans-serif",
          "center",
        );
      } else
        text(
          c,
          `${C.HUD_SCORE_LABEL}  ${s.score.toLocaleString()}     /     ${C.HUD_LEVEL_LABEL}  ${s.level}`,
          C.STAGE_CX,
          349,
          16,
          gold,
          "sans-serif",
          "center",
        );
      for (const t of targets(s)) {
        const i = Number(t.id.slice(5));
        button(c, t, menuItems(s.screen)[i], s.menuIndex === i);
      }
    }
  }
  text(
    c,
    `M  /  SOUND ${s.muted ? "OFF" : "ON"}`,
    1206,
    686,
    11,
    muted,
    "sans-serif",
    "right",
  );
}
