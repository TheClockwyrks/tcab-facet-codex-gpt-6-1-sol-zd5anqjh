import { describe, it, expect, vi, afterEach } from "vitest";
import { debug } from "./debug";
import { pointer, choose, pause, targets } from "./controls";
import {
  advance,
  cellX,
  cellY,
  deal,
  initial,
  legalSwap,
  loadBoard,
  resolve,
  runs,
  requestSwap,
  type PlayState,
  type EventName,
} from "./simulation";
const rows = Array.from({ length: 8 }, (_, r) =>
  Array.from({ length: 8 }, (_, c) => "RACJBSM"[(c + r * 2) % 7] + "0").join(
    " ",
  ),
);
const posed = (): PlayState => ({
  ...initial(),
  screen: "playing",
  board: loadBoard(rows),
});
const change = (s: PlayState, c: number, r: number, t: string) =>
  debug.setGem(s, c, r, t);
afterEach(() => vi.restoreAllMocks());
describe("opening and notation", () => {
  it("deals settled match-free productive openings with journeys from above", () => {
    for (let i = 0; i < 20; i++) {
      const b = deal();
      expect(runs(b)).toHaveLength(0);
      expect(legalSwap(b)).toBe(true);
      expect(b.cells).toHaveLength(64);
      expect(
        b.cells.every(
          (g) => g.strain === 0 && g.cut === "plain" && g.fell >= g.row + 1,
        ),
      ).toBe(true);
    }
  });
  it("validates notation and fixed domains", () => {
    expect(() => loadBoard([])).toThrow();
    expect(() => loadBoard(rows.map(() => "R0"))).toThrow();
    expect(() => change(posed(), 0, 0, "X0b")).toThrow();
    expect(() => debug.setLevel(initial(), 0)).toThrow();
    expect(() => debug.setSelection(initial(), 8, 0)).toThrow();
    expect(() => debug.setRefillKinds(initial(), 0, "X")).toThrow();
  });
  it("poses only the requested field and resets the complete round", () => {
    let s = debug.loadBoard(initial(), rows);
    s = debug.setScore(s, 91);
    s = debug.setLevelScore(s, 14);
    s = debug.setBestMove(s, 99);
    s = debug.setBestChain(s, 4);
    s = debug.setMoveScore(s, 33);
    s = debug.setLevel(s, 3);
    s = debug.setMenuIndex(s, 5);
    s = debug.setOffer(s, 1, 1);
    expect(s.score).toBe(91);
    expect(s.screen).toBe("title");
    expect(debug.reconcile(s)).toEqual(s);
    expect(debug.reset({ ...s, muted: true })).toEqual({
      ...initial(),
      muted: true,
    });
  });
});
describe("swap and resolution", () => {
  it("refuses unproductive, distant, and busy exchanges without changing stones", () => {
    const s = posed();
    for (const b of [
      { col: 1, row: 0 },
      { col: 4, row: 4 },
    ]) {
      const n = requestSwap(s, { col: 0, row: 0 }, b);
      expect(n.board).toBe(s.board);
      expect(n.refusal?.b).toEqual(b);
    }
    const n = requestSwap(
      { ...s, phase: "resolving" },
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    );
    expect(n.board).toBe(s.board);
  });
  it("waits for swap timing before scoring and preserves original state", () => {
    let s = posed();
    s = change(s, 0, 0, "R0");
    s = change(s, 1, 0, "R0");
    s = change(s, 2, 1, "R0");
    const original = s;
    const e = new Set<EventName>();
    s = requestSwap(s, { col: 2, row: 0 }, { col: 2, row: 1 });
    expect(s.phase).toBe("swapping");
    s = advance(s, 0.17, e);
    expect(s.score).toBe(0);
    s = advance(s, 0.01, e);
    expect(s.phase).toBe("resolving");
    expect(s.lastCleared).toBe(3);
    expect(s.lastPoints).toBe(30);
    expect(original.score).toBe(0);
    expect(e.has("clear")).toBe(true);
  });
  it("propagates flawed stones in waves and scores their double value", () => {
    let s = posed();
    for (let c = 0; c < 3; c++) s = change(s, c, 0, "R0");
    s = change(s, 2, 1, "J3");
    s = change(s, 3, 1, "B3");
    s = change(s, 4, 1, "S2");
    const e = new Set<EventName>();
    s = resolve({ ...s, phase: "resolving", chainStep: 2 }, e);
    expect(s.lastCleared).toBe(5);
    expect(s.lastWaves).toBe(2);
    expect(s.lastPoints).toBe(140);
    expect(
      s.board.cells.some((g) => g.kind === "sapphire" && g.strain === 3),
    ).toBe(true);
    expect(e.has("flaw")).toBe(true);
  });
  it("brilliants expand to their eight neighbors and stars to row and column", () => {
    for (const [token, count] of [
      ["R0b", 6],
      ["R0s", 15],
    ] as const) {
      let s = posed();
      for (let c = 0; c < 3; c++) s = change(s, c, 0, c === 1 ? token : "R0");
      s = resolve({ ...s, phase: "resolving", chainStep: 1 }, new Set());
      expect(s.lastCleared).toBe(count);
    }
  });
  it("creates cuts from fours, fives and intersections", () => {
    for (const [length, cut] of [
      [4, "brilliant"],
      [5, "prism"],
    ] as const) {
      let s = posed();
      for (let c = 0; c < length; c++) s = change(s, c, 0, "R0");
      s = resolve({ ...s, phase: "resolving", chainStep: 1 }, new Set());
      expect(s.board.cells.some((g) => g.cut === cut && g.strain === 0)).toBe(
        true,
      );
    }
    let s = posed();
    for (const [c, r] of [
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 0],
      [1, 2],
    ])
      s = change(s, c, r, "J0");
    s = resolve({ ...s, phase: "resolving", chainStep: 1 }, new Set());
    expect(
      s.board.cells.some((g) => g.cut === "star" && g.kind === "jade"),
    ).toBe(true);
  });
  it("prism pairs clear the whole board and deterministic refills honor row indices", () => {
    let s = posed();
    s = change(s, 0, 0, "X0");
    s = change(s, 1, 0, "X0");
    for (let c = 0; c < 8; c++) s = debug.setRefillKinds(s, c, "RACJBSMR");
    s = requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 });
    s = advance(s, 0.18, new Set());
    expect(s.lastCleared).toBe(64);
    expect(s.lastPoints).toBe(640);
    expect(s.board.cells[0].kind).toBe("ruby");
    expect(s.board.cells[8].kind).toBe("amber");
    expect(s.board.cells.every((g) => g.fell === 8)).toBe(true);
  });
  it("prism-kind swaps clear only the matching kind and the traded prism", () => {
    let s = change(posed(), 0, 0, "X0");
    const k = s.board.cells[1].kind;
    const count = s.board.cells.filter((g) => g.kind === k).length + 1;
    s = requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 });
    s = advance(s, 0.18, new Set());
    expect(s.lastCleared).toBe(count);
  });
  it("integrates the same elapsed time across frame partitions", () => {
    let s = posed();
    s = change(s, 0, 0, "X0");
    for (let c = 0; c < 8; c++) s = debug.setRefillKinds(s, c, "RACJBSMR");
    s = requestSwap(s, { col: 0, row: 0 }, { col: 1, row: 0 });
    vi.spyOn(Math, "random").mockReturnValue(0.4);
    const a = advance(s, 0.35, new Set());
    let b = s;
    for (let i = 0; i < 35; i++) b = advance(b, 0.01, new Set());
    expect(a.board).toEqual(b.board);
    expect(a.score).toBe(b.score);
    expect(a.stepTimer).toBeCloseTo(b.stepTimer, 10);
  });
  it("freezes board timers on overlays, ages refusals only in play", () => {
    let s = requestSwap(posed(), { col: 0, row: 0 }, { col: 1, row: 0 });
    expect(advance({ ...s, screen: "paused" }, 1, new Set()).refusal).toEqual(
      s.refusal,
    );
    s = advance(s, 0.3, new Set());
    expect(s.refusal).toBeNull();
  });
});
describe("pointer and screens", () => {
  it("takes target press-release and supports canceling an armed menu", () => {
    let s = initial();
    const t = targets(s)[0];
    s = pointer(s, "down", t.x + 10, t.y + 10, "touch");
    s = pointer(s, "up", 5, 5, "touch");
    expect(s.screen).toBe("title");
    s = pointer(s, "down", t.x + 10, t.y + 10, "touch");
    s = pointer(s, "up", t.x + 10, t.y + 10, "touch");
    expect(s.screen).toBe("playing");
    expect(s.board.cells).toHaveLength(64);
  });
  it("selects, previews, withdraws and submits only on release", () => {
    let s = posed();
    s = debug.pointerDown(s, cellX(0), cellY(0));
    s = debug.pointerMove(s, cellX(1), cellY(0));
    expect(s.offer).toEqual({ col: 1, row: 0 });
    expect(s.phase).toBe("idle");
    s = debug.pointerMove(s, cellX(0), cellY(0));
    s = debug.pointerUp(s);
    expect(s.offer).toBeNull();
    expect(s.selection).not.toBeNull();
    s = debug.pointerDown(s, cellX(1), cellY(0));
    s = debug.pointerUp(s);
    expect(s.refusal).not.toBeNull();
    expect(s.selection).toBeNull();
  });
  it("round transitions preserve score across levels and discard abandoned boards", () => {
    let s = choose({ ...posed(), screen: "levelclear", score: 345, level: 2 });
    expect(s.level).toBe(3);
    expect(s.score).toBe(345);
    s = pause(s);
    expect(s.screen).toBe("paused");
    s = choose({ ...s, menuIndex: 1 });
    expect(s.screen).toBe("title");
    expect(s.board.cells).toHaveLength(0);
    s = choose(s);
    expect(s.score).toBe(0);
  });
  it("snapshots derive geometry and readings directly from posed board", () => {
    const s = posed();
    const snap = debug.snapshot(s);
    expect(snap.board.cells[0]).toMatchObject({ x: 388, y: 144 });
    expect(snap.levelTarget).toBe(2000);
    expect(snap.targets[0].id).toBe("pause");
    expect(debug.snapshot(debug.clearBoard(s)).legalSwap).toBe(false);
  });
});
