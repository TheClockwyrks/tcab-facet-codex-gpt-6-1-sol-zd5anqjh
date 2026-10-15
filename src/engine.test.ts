/// <reference types="node" />
import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createEngine, ConstantClock } from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "./game";
import { debug } from "./debug";
import { cellX, cellY } from "./simulation";
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile(`public/${url}`)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(new Uint8Array(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      decodeAudioData() {
        return Promise.resolve({});
      }
    },
  );
});
afterAll(() => vi.unstubAllGlobals());
async function setup(ms = 10) {
  const events = new EventTarget();
  const canvas = createCanvas(1280, 720);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    layout: "single-vertical",
    clock: new ConstantClock(ms),
    surface: {
      cssWidth: () => 1280,
      cssHeight: () => 720,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  return { engine, canvas };
}
const rows = Array.from({ length: 8 }, (_, r) =>
  Array.from({ length: 8 }, (_, c) => "RACJBSM"[(c + r * 2) % 7] + "0").join(
    " ",
  ),
);
describe("engine integration", () => {
  it("loads real art, renders all screens and registers current-state diagnostics", async () => {
    const { engine, canvas } = await setup();
    expect(engine.debug.version).toBe(1);
    await engine.advance(1);
    expect(canvas.toBuffer("image/png").length).toBeGreaterThan(15000);
    for (const screen of [
      "howto",
      "playing",
      "paused",
      "levelclear",
      "gameover",
    ] as const) {
      engine.apply((s) => debug.setScreen(s, screen));
      if (screen === "playing") engine.apply((s) => debug.dealBoard(s));
      await engine.advance(1);
      expect(engine.state.screen).toBe(screen);
    }
    expect(engine.diagnostics().find((d) => d.name === "screen")?.value).toBe(
      "gameover",
    );
    expect(engine.diagnostics().every((d) => !d.error)).toBe(true);
    engine.destroy();
  });
  it("runs a productive release through the engine, plays cues and freezes paused timers", async () => {
    const { engine } = await setup();
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    engine.apply((s) => debug.loadBoard(s, rows));
    engine.apply((s) => debug.setScreen(s, "playing"));
    engine.apply((s) => debug.setGem(s, 1, 0, "R0"));
    engine.apply((s) => debug.setGem(s, 2, 1, "R0"));
    engine.apply((s) => debug.pointerDown(s, cellX(2), cellY(1), "touch"));
    engine.apply((s) => debug.pointerMove(s, cellX(2), cellY(0), "touch"));
    engine.apply((s) => debug.pointerUp(s, "touch"));
    expect(engine.state.phase).toBe("swapping");
    expect(cues).toEqual([]);
    await engine.advance(18);
    expect(engine.state.lastCleared).toBe(3);
    expect(cues.filter((c) => c === "clear")).toHaveLength(1);
    const step = engine.state.stepTimer;
    engine.apply((s) => debug.setScreen(s, "paused"));
    await engine.advance(50);
    expect(engine.state.stepTimer).toBe(step);
    expect(engine.state.simTime).toBeCloseTo(0.68);
    engine.destroy();
  });
  it("evaluates level completion only when a chain settles and preserves fell", async () => {
    const { engine } = await setup();
    engine.apply((s) => debug.loadBoard(s, rows));
    engine.apply((s) => debug.setScreen(s, "playing"));
    engine.apply((s) => debug.setGem(s, 0, 0, "X0"));
    engine.apply((s) => debug.setLevelScore(s, 2000));
    for (let c = 0; c < 8; c++)
      engine.apply((s) =>
        debug.setRefillKinds(
          s,
          c,
          Array.from({ length: 8 }, (_, r) => "RACJBSM"[(c + r * 2) % 7]).join(
            "",
          ),
        ),
      );
    engine.apply((s) => debug.requestSwap(s, 0, 0, 1, 0));
    await engine.advance(18);
    expect(engine.state.screen).toBe("playing");
    await engine.advance(500);
    expect(engine.state.screen).toBe("levelclear");
    expect(engine.state.bestMove).toBeGreaterThan(0);
    expect(engine.state.board.cells.some((g) => g.fell > 0)).toBe(true);
    engine.destroy();
  });
});
