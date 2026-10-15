/* global document */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import console from "node:console";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => {
  throw e;
});
await page.goto("http://localhost:5173");
await page.waitForTimeout(800);
await page.screenshot({ path: "showcase/title.png" });
await page.keyboard.press("Enter");
await page.waitForTimeout(900);
await page.screenshot({ path: "showcase/board.png" });
const recording = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const old = document.querySelector("canvas");
  const canvas = old.cloneNode();
  old.replaceWith(canvas);
  const engine = createEngine({
    canvas,
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    layout: "single-vertical",
    clock: new ConstantClock(1000 / 60),
  });
  await engine.initialize();
  const d = engine.debug;
  const rows = Array.from({ length: 8 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => "RACJBSM"[(c + r * 2) % 7] + "0").join(
      " ",
    ),
  );
  engine.apply((s) => d.loadBoard(s, rows));
  engine.apply((s) => d.setScreen(s, "playing"));
  for (const [c, r, t] of [
    [0, 2, "R0"],
    [1, 2, "R0"],
    [2, 3, "R0"],
    [2, 2, "C0"],
    [3, 2, "J3"],
    [4, 2, "B3"],
    [4, 3, "B3"],
    [5, 3, "S3"],
    [5, 4, "M3s"],
    [4, 4, "S3"],
    [3, 4, "C0b"],
    [2, 4, "R3"],
  ])
    engine.apply((s) => d.setGem(s, c, r, t));
  for (let c = 0; c < 8; c++)
    engine.apply((s) =>
      d.setRefillKinds(
        s,
        c,
        Array.from({ length: 8 }, (_, r) =>
          r === 0 && c < 3 ? "J" : "RACJBSM"[(c + r * 2) % 7],
        ).join(""),
      ),
    );
  engine.startRecording();
  await engine.advance(30);
  engine.apply((s) => d.pointerDown(s, 532, 360));
  engine.apply((s) => d.pointerMove(s, 532, 288));
  await engine.advance(22);
  engine.apply((s) => d.pointerUp(s));
  await engine.advance(12);
  for (let c = 0; c < 8; c++)
    engine.apply((s) =>
      d.setRefillKinds(
        s,
        c,
        Array.from({ length: 8 }, (_, r) => "RACJBSM"[(c + r * 2) % 7]).join(
          "",
        ),
      ),
    );
  await engine.advance(193);
  const recording = engine.stopRecording();
  return { recording, snapshot: d.snapshot(engine.state) };
});
writeFileSync(
  "showcase/chain.json.gz",
  gzipSync(JSON.stringify(recording.recording), { level: 9 }),
);
console.log({
  frames: recording.recording.frames.length,
  score: recording.snapshot.score,
  bestChain: recording.snapshot.bestChain,
});
await page.screenshot({ path: "/tmp/facet-chain-end.png" });
await browser.close();
