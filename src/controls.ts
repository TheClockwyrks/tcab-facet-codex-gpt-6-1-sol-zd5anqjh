import * as C from "./constants";
import type { CellRef, PointerDevice, Screen } from "./game";
import {
  adjacent,
  cellX,
  cellY,
  emptyBoard,
  index,
  requestSwap,
  start,
  type PlayState,
} from "./simulation";
export const menuItems = (screen: Screen): readonly string[] =>
  screen === "title"
    ? C.TITLE_ITEMS
    : screen === "paused"
      ? C.PAUSED_ITEMS
      : screen === "levelclear"
        ? C.LEVELCLEAR_ITEMS
        : screen === "gameover"
          ? C.GAMEOVER_ITEMS
          : [];
export interface Target {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export function targets(s: PlayState): Target[] {
  if (s.screen === "playing")
    return [{ id: "pause", x: 1080, y: 34, w: 144, h: C.TARGET_MIN_H }];
  if (s.screen === "howto")
    return [{ id: "back", x: 76, y: 600, w: 160, h: C.TARGET_MIN_H }];
  return menuItems(s.screen).map((_, i) => ({
    id: `menu-${i}`,
    x: s.screen === "title" ? 122 : 460,
    y: (s.screen === "title" ? 414 : 422) + i * 86,
    w: 360,
    h: C.TARGET_MIN_H,
  }));
}
export function show(s: PlayState, screen: Screen, menuIndex = 0): PlayState {
  return { ...s, screen, menuIndex, armedTarget: null };
}
export function choose(s: PlayState): PlayState {
  if (s.screen === "title")
    return s.menuIndex === 0 ? start(s) : show(s, "howto");
  if (s.screen === "paused" && s.menuIndex === 0) return show(s, "playing");
  if (s.screen === "levelclear" && s.menuIndex === 0) return start(s, true);
  if (s.screen === "gameover" && s.menuIndex === 0) return start(s);
  return {
    ...show(s, "title"),
    board: emptyBoard(),
    phase: "idle",
    chainStep: 0,
    swapTimer: 0,
    stepTimer: 0,
    selection: null,
    offer: null,
    refusal: null,
  };
}
export function back(s: PlayState): PlayState {
  return s.screen === "howto"
    ? show(s, "title", 1)
    : s.screen === "gameover"
      ? show(s, "title")
      : s;
}
export function pause(s: PlayState): PlayState {
  return s.screen === "playing"
    ? show(s, "paused")
    : s.screen === "paused"
      ? show(s, "playing")
      : s;
}
export function hitCell(x: number, y: number): CellRef | null {
  let best: CellRef | null = null;
  let distance = C.GEM_HIT_R * C.GEM_HIT_R;
  for (let row = 0; row < C.GRID_ROWS; row++)
    for (let col = 0; col < C.GRID_COLS; col++) {
      const d = (cellX(col) - x) ** 2 + (cellY(row) - y) ** 2;
      if (d <= distance && (best === null || d < distance)) {
        best = { col, row };
        distance = d;
      }
    }
  return best;
}
export function pointer(
  s: PlayState,
  type: "down" | "move" | "up",
  x: number,
  y: number,
  device: PointerDevice = "mouse",
): PlayState {
  if (
    !["mouse", "pen", "touch"].includes(device) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    throw new Error("Invalid pointer");
  const down = type === "down" || (type === "move" && s.pointer.down);
  s = { ...s, pointer: { x, y, down, device } };
  const target = targets(s).find(
    (t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h,
  );
  if (target?.id.startsWith("menu-") && (!down || type === "down"))
    s = { ...s, menuIndex: Number(target.id.slice(5)) };
  if (type === "down") s = { ...s, armedTarget: target?.id ?? null };
  if (type === "up") {
    const armed = s.armedTarget;
    s = { ...s, armedTarget: null };
    if (armed && target?.id === armed)
      return armed === "pause"
        ? pause(s)
        : armed === "back"
          ? back(s)
          : choose(s);
    if (armed) return s;
  }
  if (s.screen !== "playing" || target || s.armedTarget) return s;
  const cell = hitCell(x, y);
  if (type === "down") {
    if (!cell) return { ...s, selection: null, offer: null };
    if (s.selection && index(s.selection) === index(cell))
      return { ...s, offer: null };
    if (!s.selection || !adjacent(s.selection, cell))
      return { ...s, selection: cell, offer: null };
    return { ...s, offer: cell };
  }
  if (type === "move" && down && s.selection && cell) {
    if (index(s.selection) === index(cell)) return { ...s, offer: null };
    if (adjacent(s.selection, cell)) return { ...s, offer: cell };
  }
  if (type === "up" && s.selection && s.offer)
    return {
      ...requestSwap(s, s.selection, s.offer),
      selection: null,
      offer: null,
    };
  return s;
}
