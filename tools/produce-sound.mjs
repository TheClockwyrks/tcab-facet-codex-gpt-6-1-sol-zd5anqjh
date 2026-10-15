import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const call = (bin, args) =>
  execFileSync(bin, args.map(String), { stdio: "pipe" });
const base = "public/assets/audio";
mkdirSync(base, { recursive: true });
for (const [name, freq, dur, wave] of [
  ["select", 880, 80, "sine"],
  ["swap", 480, 150, "triangle"],
  ["refuse", 105, 160, "square"],
  ["land", 90, 190, "sine"],
  ["flaw", 230, 110, "noise"],
  ["cut", 1400, 380, "sine"],
  ["levelup", 660, 600, "triangle"],
  ["gameover", 220, 700, "triangle"],
  ...Array.from({ length: 8 }, (_, i) => [
    `clear-${i + 1}`,
    330 * 2 ** (i / 6),
    350,
    "sine",
  ]),
]) {
  const config = {
    sample_rate: 22050,
    channels: "mono",
    max_duration_ms: 1000,
    seed: 42,
    actions: "/tmp/sound-log.json",
    preview: "/tmp/sound.png",
    wav: `${base}/${name}.wav`,
  };
  writeFileSync("/tmp/sound.json", JSON.stringify(config));
  call("sfx-synth", ["--config", "/tmp/sound.json", "init"]);
  call("sfx-synth", [
    "--config",
    "/tmp/sound.json",
    "add-voice",
    "--name",
    "tone",
    "--wave",
    wave,
    "--freq",
    freq,
    "--dur",
    dur,
    "--gain",
    -19,
  ]);
  call("sfx-synth", [
    "--config",
    "/tmp/sound.json",
    "set-envelope",
    "--voice",
    "tone",
    "--env",
    "pluck",
  ]);
  if (["swap", "levelup", "gameover"].includes(name))
    call("sfx-synth", [
      "--config",
      "/tmp/sound.json",
      "set-pitch",
      "--voice",
      "tone",
      "--slide-to",
      name === "gameover" ? 70 : freq * 2,
      "--over",
      dur,
    ]);
  if (name.startsWith("clear") || name === "cut") {
    call("sfx-synth", [
      "--config",
      "/tmp/sound.json",
      "add-voice",
      "--name",
      "overtone",
      "--wave",
      "sine",
      "--freq",
      freq * 2.76,
      "--dur",
      dur * 0.7,
      "--gain",
      -25,
    ]);
    call("sfx-synth", [
      "--config",
      "/tmp/sound.json",
      "set-envelope",
      "--voice",
      "overtone",
      "--env",
      "pluck",
    ]);
  }
  call("sfx-synth", ["--config", "/tmp/sound.json", "render"]);
}
copyFileSync(`${base}/clear-1.wav`, `${base}/clear.wav`);
for (const name of ["title", "play"]) {
  writeFileSync(
    "/tmp/music.json",
    JSON.stringify({
      sample_rate: 22050,
      channels: "stereo",
      max_duration_ms: 18000,
      seed: 42,
      instrument_bank: "gm-lite",
      actions: "/tmp/music-log.json",
      preview: "/tmp/music.png",
      wav: `${base}/${name}.wav`,
      mid: `${base}/${name}.mid`,
    }),
  );
  const m = (...args) =>
    call("music", ["--config", "/tmp/music.json", ...args]);
  m("init");
  m("set-tempo", "--bpm", name === "title" ? 108 : 84);
  m(
    "define-track",
    "--name",
    "glass",
    "--instrument",
    name === "title" ? "music_box" : "vibraphone",
  );
  m("define-track", "--name", "bass", "--instrument", "marimba");
  m("set-track-fx", "--track", "glass", "--gain", -19, "--reverb", 0.25);
  m("set-track-fx", "--track", "bass", "--gain", -23);
  const melody =
    name === "title"
      ? [76, 79, 83, 81, 79, 74, 76, 71, 72, 76, 79, 78, 76, 74, 71, 74]
      : [71, 78, 74, 81, 79, 74, 76, 71, 69, 76, 72, 79, 78, 74, 71, 66];
  for (let i = 0; i < 32; i++) {
    m(
      "add-note",
      "--track",
      "glass",
      "--pitch",
      melody[i % 16],
      "--t",
      i * 0.75,
      "--dur",
      0.5,
      "--velocity",
      i % 4 === 0 ? 90 : 65,
    );
    if (i % 2 === 0)
      m(
        "add-note",
        "--track",
        "bass",
        "--pitch",
        [47, 43, 48, 45][Math.floor(i / 8)],
        "--t",
        i * 0.75,
        "--dur",
        1,
        "--velocity",
        70,
      );
  }
  m("render");
}
const template = {
  dimensions: 2,
  field: { width: 160, height: 160 },
  durationMs: 1000,
  fps: 30,
  loop: false,
  emitters: [
    {
      name: "chips",
      shape: "point",
      position: [0, 0, 0],
      extent: { radius: 1, size: [1, 1, 0] },
      emission: { mode: "burst", count: 16, atMs: 0 },
      lifetimeMs: 500,
      speed: 65,
      direction: [0, 1, 0],
      coneAngle: 180,
    },
  ],
};
for (const [name, count, speed, color] of [
  ["clear", 14, 65, "#9defff"],
  ["flawed", 32, 120, "#ffd9a0"],
  ["cut", 26, 85, "#fff0b0"],
  ["aura", 5, 12, "#b8f5ed"],
]) {
  const sys = JSON.parse(JSON.stringify(template));
  sys.loop = name === "aura";
  sys.durationMs = 1000;
  sys.forces = { gravity: name === "aura" ? -8 : 100, drag: 1 };
  const e = sys.emitters[0];
  e.extent.radius = name === "aura" ? 22 : 3;
  e.shape = "disc";
  e.emission =
    name === "aura"
      ? { mode: "rate", rate: count }
      : { mode: "burst", count, atMs: 0 };
  e.lifetimeMs = name === "aura" ? 1100 : 600;
  e.speed = speed;
  e.speedSpread = speed * 0.4;
  e.particle = {
    sizeCurve: { interp: "linear", from: name === "flawed" ? 2 : 1, to: 0 },
    opacityCurve: { interp: "linear", from: 1, to: 0 },
    colorGradient: [
      { color, at: 0 },
      { color: "#587eac", at: 1 },
    ],
  };
  mkdirSync(`public/assets/fx/${name}`, { recursive: true });
  writeFileSync(
    `public/assets/fx/${name}/system.json`,
    JSON.stringify(sys, null, 2),
  );
}
// A glass/debris body to layer under the chain tones.
writeFileSync(
  "/tmp/facet-sample.json",
  JSON.stringify({
    sample_rate: 22050,
    channels: "mono",
    max_duration_ms: 1000,
    seed: 42,
    sample_pack: "combat-core",
    actions: "/tmp/facet-sample-log.json",
    preview: "/tmp/facet-sample.png",
    wav: `${base}/shatter.wav`,
  }),
);
for (const args of [
  ["init"],
  ["add-sample", "--name", "debris_glass", "--t", 0, "--gain", -18],
  ["add-sample", "--name", "snap_transient", "--t", 0, "--gain", -24],
  ["render"],
])
  call("sfx-sample", ["--config", "/tmp/facet-sample.json", ...args]);

copyFileSync(`${base}/shatter.wav`, `${base}/clear.wav`);
