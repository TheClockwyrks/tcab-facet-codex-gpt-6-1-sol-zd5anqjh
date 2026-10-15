import * as C from "./constants";
import type { CellRef, FacetState, PointerDevice, Screen } from "./game";
import { targets, pointer } from "./controls";
import {
  cellX,
  cellY,
  checkCell,
  deal,
  emptyBoard,
  index,
  initial,
  lastFall,
  legalSwap,
  letters,
  loadBoard,
  parse,
  requestSwap,
  stepHold,
  type PlayState,
} from "./simulation";
function integer(n: number, min = 0) {
  if (!Number.isInteger(n) || n < min)
    throw new RangeError("Expected whole number");
  return n;
}
function points(n: number) {
  if (!Number.isFinite(n)) throw new RangeError("Expected finite points");
  return n;
}
const cell = (col: number, row: number): CellRef => {
  checkCell(col, row);
  return { col, row };
};
export function snapshot(s: FacetState) {
  return {
    version: C.FACET_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    score: s.score,
    level: s.level,
    levelScore: s.levelScore,
    levelTarget: C.LEVEL_TARGET_STEP * s.level,
    phase: s.phase,
    chainStep: s.chainStep,
    multiplier: Math.min(s.chainStep, C.MAX_MULTIPLIER),
    swapTimer: s.swapTimer,
    stepTimer: s.stepTimer,
    stepHold: stepHold(s),
    board: {
      ...s.board,
      cells: s.board.cells.map((g) => ({
        ...g,
        x: cellX(g.col),
        y: cellY(g.row),
      })),
    },
    selection: s.selection,
    offer: s.offer,
    refusal: s.refusal ? { a: s.refusal.a, b: s.refusal.b } : null,
    lastCleared: s.lastCleared,
    lastPoints: s.lastPoints,
    lastWaves: s.lastWaves,
    lastFall: lastFall(s),
    moveScore: s.moveScore,
    bestMove: s.bestMove,
    bestChain: s.bestChain,
    legalSwap: legalSwap(s.board),
    refillKinds: [...s.refillKinds],
    pointer: { ...s.pointer },
    armedTarget: s.armedTarget,
    targets: targets(s),
    muted: s.muted,
    simTime: s.simTime,
  };
}
export const debug = {
  version: C.FACET_DEBUG_VERSION,
  reset: (s: PlayState): PlayState => ({ ...initial(), muted: s.muted }),
  reconcile: (s: PlayState): PlayState => ({ ...s }),
  snapshot,
  setScreen: (s: PlayState, screen: Screen): PlayState => {
    if (
      ![
        "title",
        "howto",
        "playing",
        "paused",
        "levelclear",
        "gameover",
      ].includes(screen)
    )
      throw new Error("Invalid screen");
    return { ...s, screen };
  },
  setMenuIndex: (s: PlayState, n: number): PlayState => ({
    ...s,
    menuIndex: integer(n),
  }),
  loadBoard: (s: PlayState, rows: readonly string[]): PlayState => ({
    ...s,
    board: loadBoard(rows),
  }),
  dealBoard: (s: PlayState): PlayState => ({
    ...s,
    board: deal(),
    motion: {
      swap: null,
      prismKind: null,
      cleared: [],
      created: [],
      openingAt: s.simTime,
    },
  }),
  clearBoard: (s: PlayState): PlayState => ({ ...s, board: emptyBoard() }),
  setGem: (
    s: PlayState,
    col: number,
    row: number,
    token: string,
  ): PlayState => {
    const p = cell(col, row);
    if (!s.board.cells[index(p)]) throw new Error("No board");
    return {
      ...s,
      board: {
        ...s.board,
        cells: s.board.cells.map((g, i) =>
          i === index(p) ? parse(token, col, row) : g,
        ),
      },
    };
  },
  setRefillKinds: (s: PlayState, col: number, kinds: string): PlayState => {
    checkCell(col, 0);
    if (!new RegExp(`^[${letters}]*$`).test(kinds))
      throw new Error("Invalid refill");
    return {
      ...s,
      refillKinds: s.refillKinds.map((v, i) => (i === col ? kinds : v)),
    };
  },
  clearRefillKinds: (s: PlayState): PlayState => ({
    ...s,
    refillKinds: Array<string>(C.GRID_COLS).fill(""),
  }),
  setScore: (s: PlayState, n: number): PlayState => ({
    ...s,
    score: points(n),
  }),
  setLevel: (s: PlayState, n: number): PlayState => ({
    ...s,
    level: integer(n, 1),
  }),
  setLevelScore: (s: PlayState, n: number): PlayState => ({
    ...s,
    levelScore: points(n),
  }),
  setBestChain: (s: PlayState, n: number): PlayState => ({
    ...s,
    bestChain: integer(n),
  }),
  setBestMove: (s: PlayState, n: number): PlayState => ({
    ...s,
    bestMove: points(n),
  }),
  setMoveScore: (s: PlayState, n: number): PlayState => ({
    ...s,
    moveScore: points(n),
  }),
  setSelection: (s: PlayState, col: number, row: number): PlayState => ({
    ...s,
    selection: cell(col, row),
  }),
  clearSelection: (s: PlayState): PlayState => ({ ...s, selection: null }),
  setOffer: (s: PlayState, col: number, row: number): PlayState => ({
    ...s,
    offer: cell(col, row),
  }),
  clearOffer: (s: PlayState): PlayState => ({ ...s, offer: null }),
  clearRefusal: (s: PlayState): PlayState => ({ ...s, refusal: null }),
  clearChain: (s: PlayState): PlayState => ({
    ...s,
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
  }),
  requestSwap: (
    s: PlayState,
    colA: number,
    rowA: number,
    colB: number,
    rowB: number,
  ): PlayState => requestSwap(s, cell(colA, rowA), cell(colB, rowB)),
  pointerDown: (
    s: PlayState,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ): PlayState => pointer(s, "down", x, y, device),
  pointerMove: (
    s: PlayState,
    x: number,
    y: number,
    device: PointerDevice = "mouse",
  ): PlayState => pointer(s, "move", x, y, device),
  pointerUp: (s: PlayState, device: PointerDevice = "mouse"): PlayState =>
    pointer(s, "up", s.pointer.x, s.pointer.y, device),
};
export type FacetDebugApi = typeof debug;
