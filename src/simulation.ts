import * as C from "./constants";
import type {
  BoardState,
  CellRef,
  Cut,
  FacetState,
  GemKind,
  GemState,
} from "./game";
export const cellX = (col: number) =>
  C.BOARD_CX - ((C.GRID_COLS - 1) * C.CELL_PITCH) / 2 + col * C.CELL_PITCH;
export const cellY = (row: number) =>
  C.BOARD_CY - ((C.GRID_ROWS - 1) * C.CELL_PITCH) / 2 + row * C.CELL_PITCH;
export const index = (p: CellRef) => p.row * C.GRID_COLS + p.col;
export const adjacent = (a: CellRef, b: CellRef) =>
  Math.abs(a.col - b.col) + Math.abs(a.row - b.row) === 1;
export const emptyBoard = (): BoardState => ({ cols: 0, rows: 0, cells: [] });
export const initial = (): FacetState => ({
  screen: "title",
  menuIndex: 0,
  board: emptyBoard(),
  phase: "idle",
  chainStep: 0,
  swapTimer: 0,
  stepTimer: 0,
  score: 0,
  level: 1,
  levelScore: 0,
  lastCleared: 0,
  lastPoints: 0,
  lastWaves: 0,
  moveScore: 0,
  bestMove: 0,
  bestChain: 0,
  selection: null,
  offer: null,
  refusal: null,
  armedTarget: null,
  pointer: { x: 0, y: 0, down: false, device: "mouse" },
  simTime: 0,
  muted: false,
  refillKinds: Array<string>(C.GRID_COLS).fill(""),
});
export const letters = "RACJBSM";
export function checkCell(col: number, row: number) {
  if (
    !Number.isInteger(col) ||
    !Number.isInteger(row) ||
    col < 0 ||
    row < 0 ||
    col >= C.GRID_COLS ||
    row >= C.GRID_ROWS
  )
    throw new RangeError("Cell outside board");
}
export function parse(token: string, col: number, row: number): GemState {
  if (!/^(?:[RACJBSM][0-3][bs]?|X[0-3])$/.test(token))
    throw new Error(`Invalid gem: ${token}`);
  return {
    col,
    row,
    kind: token[0] === "X" ? null : C.GEM_KINDS[letters.indexOf(token[0])],
    strain: Number(token[1]),
    cut:
      token[0] === "X"
        ? "prism"
        : token[2] === "b"
          ? "brilliant"
          : token[2] === "s"
            ? "star"
            : "plain",
    fell: 0,
  };
}
export function loadBoard(rows: readonly string[]): BoardState {
  if (rows.length !== C.GRID_ROWS) throw new Error("Expected eight rows");
  return {
    cols: C.GRID_COLS,
    rows: C.GRID_ROWS,
    cells: rows.flatMap((line, row) => {
      const tokens = line.trim().split(/\s+/);
      if (tokens.length !== C.GRID_COLS)
        throw new Error("Expected eight cells");
      return tokens.map((t, col) => parse(t, col, row));
    }),
  };
}
export interface Run {
  cells: number[];
  axis: "h" | "v";
}
export function runs(board: BoardState): Run[] {
  const out: Run[] = [];
  for (const axis of ["h", "v"] as const)
    for (let line = 0; line < C.GRID_ROWS; line++) {
      let group: number[] = [];
      let kind: GemKind | null = null;
      const flush = () => {
        if (group.length >= C.MATCH_MIN) out.push({ cells: group, axis });
        group = [];
      };
      for (let n = 0; n < C.GRID_COLS; n++) {
        const i =
          axis === "h" ? line * C.GRID_COLS + n : n * C.GRID_COLS + line;
        const k = board.cells[i]?.kind ?? null;
        if (k !== kind || k === null) flush();
        group.push(i);
        kind = k;
      }
      flush();
    }
  return out;
}
export function exchange(
  board: BoardState,
  a: CellRef,
  b: CellRef,
): BoardState {
  const cells = [...board.cells];
  const ai = index(a),
    bi = index(b);
  if (!cells[ai] || !cells[bi]) throw new Error("No gem at cell");
  const ag = cells[ai],
    bg = cells[bi];
  cells[ai] = { ...bg, ...a, fell: 0 };
  cells[bi] = { ...ag, ...b, fell: 0 };
  return { ...board, cells };
}
export function productive(board: BoardState, a: CellRef, b: CellRef) {
  return (
    adjacent(a, b) &&
    !!board.cells[index(a)] &&
    !!board.cells[index(b)] &&
    (board.cells[index(a)].cut === "prism" ||
      board.cells[index(b)].cut === "prism" ||
      runs(exchange(board, a, b)).length > 0)
  );
}
export function legalSwap(board: BoardState) {
  return board.cells.some((g) =>
    [
      [g.col + 1, g.row],
      [g.col, g.row + 1],
    ].some(
      ([col, row]) =>
        col < C.GRID_COLS &&
        row < C.GRID_ROWS &&
        productive(board, g, { col, row }),
    ),
  );
}
const randomKind = () =>
  C.GEM_KINDS[Math.floor(Math.random() * C.GEM_KIND_COUNT)];
export function deal(): BoardState {
  for (;;) {
    const cells: GemState[] = [];
    for (let row = 0; row < C.GRID_ROWS; row++)
      for (let col = 0; col < C.GRID_COLS; col++) {
        let kind: GemKind;
        do {
          kind = randomKind();
        } while (
          (col >= 2 &&
            cells[cells.length - 1]?.kind === kind &&
            cells[cells.length - 2]?.kind === kind) ||
          (row >= 2 &&
            cells[(row - 1) * C.GRID_COLS + col]?.kind === kind &&
            cells[(row - 2) * C.GRID_COLS + col]?.kind === kind)
        );
        cells.push({ col, row, kind, cut: "plain", strain: 0, fell: row + 1 });
      }
    const board = { cols: C.GRID_COLS, rows: C.GRID_ROWS, cells };
    if (legalSwap(board)) return board;
  }
}
// Animation data is a derived record of the transition, never read by the rules.
export interface Motion {
  readonly swap: readonly [CellRef, CellRef] | null;
  readonly prismKind: GemKind | "all" | null;
  readonly cleared: readonly { gem: GemState; wave: number }[];
  readonly created: readonly CellRef[];
  readonly openingAt: number;
}
export type PlayState = FacetState & { readonly motion?: Motion };
export const motion = (s: PlayState): Motion =>
  s.motion ?? {
    swap: null,
    prismKind: null,
    cleared: [],
    created: [],
    openingAt: -10,
  };
export function requestSwap(s: PlayState, a: CellRef, b: CellRef): PlayState {
  checkCell(a.col, a.row);
  checkCell(b.col, b.row);
  if (s.phase !== "idle" || !productive(s.board, a, b))
    return { ...s, refusal: { a, b, timer: 0 } };
  const ag = s.board.cells[index(a)],
    bg = s.board.cells[index(b)];
  const prismKind =
    ag.cut === "prism"
      ? bg.cut === "prism"
        ? "all"
        : bg.kind
      : bg.cut === "prism"
        ? ag.kind
        : null;
  return {
    ...s,
    board: exchange(s.board, a, b),
    phase: "swapping",
    swapTimer: 0,
    chainStep: 0,
    stepTimer: 0,
    moveScore: 0,
    refusal: null,
    motion: { ...motion(s), swap: [a, b], prismKind, cleared: [], created: [] },
  };
}
export type EventName = keyof typeof C.CUES;
export function resolve(s: PlayState, events: Set<EventName>): PlayState {
  const board = s.board;
  const m = motion(s);
  const rr = s.chainStep === 1 && m.prismKind ? [] : runs(board);
  const waves = new Map<number, number>();
  if (s.chainStep === 1 && m.prismKind) {
    for (const g of board.cells)
      if (
        m.prismKind === "all" ||
        g.kind === m.prismKind ||
        (g.cut === "prism" && m.swap?.some((p) => index(p) === index(g)))
      )
        waves.set(index(g), 0);
  } else for (const r of rr) for (const i of r.cells) waves.set(i, 0);
  const queue = [...waves.keys()];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q],
      g = board.cells[i],
      w = waves.get(i)!;
    for (const n of board.cells) {
      const dx = Math.abs(n.col - g.col),
        dy = Math.abs(n.row - g.row);
      if (
        (g.cut === "brilliant" && dx <= 1 && dy <= 1) ||
        (g.cut === "star" && (dx === 0 || dy === 0)) ||
        (n.strain === C.MAX_STRAIN && dx + dy === 1)
      ) {
        const ni = index(n);
        if (!waves.has(ni)) {
          waves.set(ni, w + 1);
          queue.push(ni);
        }
      }
    }
  }
  if (!waves.size) return s;
  const created = new Map<number, Cut>();
  const rank = (cut: Cut) => C.CUTS.indexOf(cut);
  const put = (i: number, cut: Cut) => {
    if (rank(cut) > rank(created.get(i) ?? "plain")) created.set(i, cut);
  };
  for (const r of rr) {
    if (r.cells.length >= 4) {
      const pos =
        r.cells.find((i) => m.swap?.some((p) => index(p) === i)) ??
        r.cells[Math.floor((r.cells.length - 1) / 2)];
      put(pos, r.cells.length >= 5 ? "prism" : "brilliant");
    }
    for (const other of rr)
      if (other.axis !== r.axis)
        for (const i of r.cells) if (other.cells.includes(i)) put(i, "star");
  }
  const points = [...waves.keys()].reduce(
    (sum, i) =>
      sum +
      (board.cells[i].strain === C.MAX_STRAIN ? C.FLAWED_SCORE : C.BASE_SCORE) *
        Math.min(s.chainStep, C.MAX_MULTIPLIER),
    0,
  );
  const cells: (GemState | null)[] = board.cells.map((g, i) => {
    if (waves.has(i)) return null;
    const strain = Math.min(
      C.MAX_STRAIN,
      g.strain +
        (board.cells.some((n) => waves.has(index(n)) && adjacent(g, n))
          ? 1
          : 0),
    );
    if (strain === C.MAX_STRAIN && g.strain < strain) events.add("flaw");
    return { ...g, strain, fell: 0 };
  });
  for (const [i, cut] of created) {
    const g = board.cells[i];
    cells[i] = {
      ...g,
      cut,
      kind: cut === "prism" ? null : g.kind,
      strain: 0,
      fell: 0,
    };
  }
  if (created.size) events.add("cut");
  const createdPositions = [...created.keys()].map((i) => {
    const g = board.cells[i];
    let row = g.row;
    for (let r = g.row + 1; r < C.GRID_ROWS; r++)
      if (cells[r * C.GRID_COLS + g.col] === null) row++;
    return { col: g.col, row };
  });
  for (let col = 0; col < C.GRID_COLS; col++) {
    const survivors = cells.filter(
      (g): g is GemState => g !== null && g.col === col,
    );
    const count = C.GRID_ROWS - survivors.length;
    for (let row = 0; row < C.GRID_ROWS; row++) {
      const old = survivors[row - count];
      const letter = s.refillKinds[col]?.[row];
      cells[row * C.GRID_COLS + col] = old
        ? { ...old, row, fell: row - old.row }
        : {
            col,
            row,
            kind: letter ? C.GEM_KINDS[letters.indexOf(letter)] : randomKind(),
            cut: "plain",
            strain: 0,
            fell: count,
          };
    }
  }
  events.add("clear");
  return {
    ...s,
    board: { ...board, cells: cells as GemState[] },
    score: s.score + points,
    levelScore: s.levelScore + points,
    moveScore: s.moveScore + points,
    lastCleared: waves.size,
    lastPoints: points,
    lastWaves: Math.max(...waves.values()),
    bestChain: Math.max(s.bestChain, s.chainStep),
    stepTimer: 0,
    motion: {
      ...m,
      cleared: [...waves].map(([i, wave]) => ({ gem: board.cells[i], wave })),
      created: createdPositions,
    },
  };
}
export const lastFall = (s: FacetState) =>
  Math.max(0, ...s.board.cells.map((g) => g.fell));
export const landAt = (s: FacetState) =>
  s.lastWaves * C.WAVE_SECONDS + lastFall(s) * C.FALL_SECONDS_PER_ROW;
export const stepHold = (s: FacetState) => landAt(s) + C.STEP_SECONDS;
export function advance(
  s: PlayState,
  dt: number,
  events: Set<EventName>,
): PlayState {
  if (s.screen !== "playing") return s;
  if (s.refusal)
    s = {
      ...s,
      refusal:
        s.refusal.timer + dt >= C.REFUSAL_SECONDS
          ? null
          : { ...s.refusal, timer: s.refusal.timer + dt },
    };
  let remaining = dt;
  while (remaining > 0 && s.phase !== "idle") {
    if (s.phase === "swapping") {
      const take = Math.min(remaining, C.SWAP_SECONDS - s.swapTimer);
      s = { ...s, swapTimer: s.swapTimer + take };
      remaining -= take;
      if (s.swapTimer + 1e-9 >= C.SWAP_SECONDS)
        s = resolve(
          { ...s, phase: "resolving", swapTimer: 0, chainStep: 1 },
          events,
        );
      else break;
    } else {
      const prev = s.stepTimer;
      const take = Math.min(remaining, Math.max(0, stepHold(s) - prev));
      s = { ...s, stepTimer: prev + take };
      remaining -= take;
      if (
        prev < landAt(s) &&
        s.stepTimer >= landAt(s) &&
        lastFall(s) > C.LAND_MIN_ROWS
      )
        events.add("land");
      if (s.stepTimer + 1e-9 >= stepHold(s)) {
        if (runs(s.board).length)
          s = resolve(
            { ...s, chainStep: s.chainStep + 1, stepTimer: 0 },
            events,
          );
        else {
          s = {
            ...s,
            phase: "idle",
            chainStep: 0,
            stepTimer: 0,
            bestMove: Math.max(s.bestMove, s.moveScore),
          };
          if (s.levelScore >= C.LEVEL_TARGET_STEP * s.level) {
            s = { ...s, screen: "levelclear", menuIndex: 0, armedTarget: null };
            events.add("levelUp");
          } else if (!legalSwap(s.board)) {
            s = { ...s, screen: "gameover", menuIndex: 0, armedTarget: null };
            events.add("gameOver");
          }
        }
      } else break;
    }
  }
  return s;
}
export function start(s: PlayState, next = false): PlayState {
  return {
    ...s,
    ...(!next ? initial() : {}),
    muted: s.muted,
    simTime: s.simTime,
    screen: "playing",
    menuIndex: 0,
    level: next ? s.level + 1 : 1,
    levelScore: 0,
    bestMove: 0,
    bestChain: 0,
    board: deal(),
    motion: {
      swap: null,
      prismKind: null,
      cleared: [],
      created: [],
      openingAt: s.simTime,
    },
  };
}
