import console from "node:console";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
// Author particle operations and export their portable live systems.
for (const name of ["clear", "flawed", "cut", "aura"]) {
  const path = `public/assets/fx/${name}/system.json`;
  const s = JSON.parse(readFileSync(path, "utf8"));
  const config = {
    width: s.field.width,
    height: s.field.height,
    duration_ms: s.durationMs,
    fps: s.fps,
    seed: 42,
    actions: "/tmp/facet-fx-log.json",
    preview: "/tmp/facet-fx.png",
    system: path,
  };
  writeFileSync("/tmp/facet-fx-config.json", JSON.stringify(config));
  writeFileSync(
    "/tmp/facet-fx-log.json",
    JSON.stringify([
      { op: "add_emitter", def: s.emitters[0] },
      { op: "set_forces", emitter: null, forces: s.forces },
      {
        op: "set_particle",
        emitter: "chips",
        particle: s.emitters[0].particle,
      },
      { op: "set_timeline", looping: s.loop },
    ]),
  );
  try {
    execFileSync(
      "particle-2d",
      ["--config", "/tmp/facet-fx-config.json", "render", "--frame", "5"],
      { stdio: "pipe" },
    );
  } catch (e) {
    console.log(String(e.stderr));
  }
}
