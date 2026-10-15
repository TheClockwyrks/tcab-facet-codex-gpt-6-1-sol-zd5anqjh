# Facet

A browser puzzle of cut stones and accumulating pressure. Swap neighboring gems into lines of three or more. Every clear strains nearby stones; flawed gems detonate with a neighboring clear and score double. Earn brilliants, stars, and prisms to turn a small match into a board-spanning chain.

## Run

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Everything runs in the browser, with no service, account, or external requests.

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`. Serve it at any URL prefix; its asset paths are relative. The build bundles the committed assets and does not run any asset-generation tools.

## Controls

- Mouse, pen, or finger: press a stone, drag onto an orthogonal neighbor, and release. You can also select one stone, then press and release its neighbor. Carry it back before releasing to cancel.
- Click or touch every menu choice, PAUSE, or BACK.
- Arrow keys: move the menu highlight. Enter or Space: choose.
- Escape or P: pause and resume. Escape also returns from the guide and the finished round.
- M: mute music and effects. Backtick: engine diagnostics.

## Development

The Simple 2D engine owns the canvas fit, frame clock, input, assets, audio, diagnostics, and recording. `src/simulation.ts` contains the board rules; `src/controls.ts` handles menu and pointer transitions; `src/debug.ts` exposes the specified immutable poses and readings. `src/presentation.ts` loads the produced assets, connects frame events to audio, and renders the game. Game state and exported types live in `src/game.ts`.

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

Tests cover the rules, immutable poses, pointer interactions, timing, opening boards, real asset loading, rendering, diagnostics, and complete chains through the engine with a controlled clock.

## Original assets

`public/assets/` contains the finished art, break frames, prism turn, four live particle systems, nine event sounds, eight ascending chain tones, glass shatter, and two sequenced musical pieces with MIDI scores. All were produced for Facet. No downloaded artwork or runtime drawing substitutes are used for stones.

The scripts in `tools/produce-assets.mjs`, `tools/produce-sound.mjs`, and `tools/finish-assets.mjs` record the one-time production process. They require the production environment's `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, and `music` binaries; sampled glass was authored with `sfx-sample` over `combat-core`. They are deliberately separate from installation and building. The committed files are the shipping assets.

The player-facing description, screenshots, and an engine recording of live play are in `showcase/`.
