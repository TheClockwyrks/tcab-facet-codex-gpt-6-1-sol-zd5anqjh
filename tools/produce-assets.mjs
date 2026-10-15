// One-time production. The build only copies the committed outputs.
import { createCanvas } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const root = "public/assets";
const names = [
  "ruby",
  "amber",
  "citrine",
  "jade",
  "beryl",
  "sapphire",
  "amethyst",
  "prism",
];
const hues = [350, 28, 49, 152, 182, 220, 279, 195];
const outlines = [
  [
    [32, 4],
    [51, 15],
    [57, 36],
    [32, 59],
    [7, 36],
    [13, 15],
  ],
  [
    [20, 7],
    [44, 7],
    [58, 31],
    [44, 55],
    [20, 55],
    [6, 31],
  ],
  [
    [32, 3],
    [56, 32],
    [32, 60],
    [8, 32],
  ],
  [
    [17, 8],
    [46, 8],
    [55, 18],
    [55, 46],
    [46, 55],
    [17, 55],
    [8, 46],
    [8, 18],
  ],
  [
    [32, 3],
    [53, 20],
    [48, 47],
    [32, 59],
    [16, 47],
    [11, 20],
  ],
  [
    [17, 9],
    [47, 9],
    [59, 27],
    [32, 58],
    [5, 27],
  ],
  [
    [32, 4],
    [55, 18],
    [55, 46],
    [32, 60],
    [9, 46],
    [9, 18],
  ],
  [
    [32, 3],
    [55, 18],
    [55, 46],
    [32, 60],
    [9, 46],
    [9, 18],
  ],
];
function polygon(c, pts, fill) {
  c.fillStyle = fill;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}
function gem(i, strain, turn = 0) {
  const cv = createCanvas(64, 64),
    c = cv.getContext("2d");
  let p = outlines[i].map(([x, y]) => [
    32 + (x - 32) * (turn ? 0.75 + 0.25 * Math.cos(turn) : 1),
    y,
  ]);
  polygon(c, p, `hsl(${hues[i]},60%,14%)`);
  const inner = p.map(([x, y]) => [32 + (x - 32) * 0.55, 30 + (y - 32) * 0.52]);
  for (let j = 0; j < p.length; j++) {
    let h = i === 7 ? (j * 55 + turn * 80) % 360 : hues[i];
    polygon(
      c,
      [p[j], p[(j + 1) % p.length], inner[(j + 1) % p.length], inner[j]],
      `hsl(${h},${i === 7 ? 40 : 75}%,${[66, 45, 29, 23, 40, 72, 58, 38][j]}%)`,
    );
  }
  polygon(
    c,
    inner,
    `hsl(${hues[i]},${i === 7 ? 18 : 73}%,${i === 7 ? 86 : 53}%)`,
  );
  c.strokeStyle = `hsl(${hues[i]},80%,83%)`;
  c.lineWidth = 1;
  c.beginPath();
  p.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.stroke();
  c.fillStyle = "#ffffffb0";
  c.fillRect(23, 16, 9, 2);
  c.fillRect(20, 19, 3, 5);
  for (let j = 0; j < strain; j++) {
    c.lineWidth = strain === 3 ? 2 : 1;
    c.strokeStyle = j === 2 ? "#fff2cc" : "#07131f";
    c.beginPath();
    c.moveTo(29 + j * 5, 7 + j * 7);
    c.lineTo(25 + j * 2, 25);
    c.lineTo(37 - j * 6, 35);
    c.lineTo(26 + j * 7, 55 - j * 5);
    c.stroke();
    c.strokeStyle = "#ffffff90";
    c.lineWidth = 1;
    c.stroke();
  }
  if (strain === 3) {
    c.fillStyle = "#fff1c5";
    for (const [x, y] of [
      [12, 28],
      [47, 44],
      [29, 56],
    ])
      c.fillRect(x, y, 3, 3);
  }
  return cv;
}
function emit(cv, path, sheet = false) {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  const { width: w, height: h } = cv;
  const data = cv.getContext("2d").getImageData(0, 0, w, h).data;
  const ops = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w;) {
      let k = (y * w + x) * 4;
      if (!data[k + 3]) {
        x++;
        continue;
      }
      let col = Array.from(data.slice(k, k + 4))
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      let end = x + 1;
      while (
        end < w &&
        Array.from(data.slice((y * w + end) * 4, (y * w + end) * 4 + 4))
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("") === col
      )
        end++;
      ops.push({
        op: "fill_rect",
        x,
        y,
        width: end - x,
        height: 1,
        color: "#" + col,
      });
      x = end;
    }
  }
  writeFileSync("/tmp/facet-actions.json", JSON.stringify(ops));
  execFileSync(sheet ? "draw-sheet" : "draw", [
    "render",
    "--actions",
    "/tmp/facet-actions.json",
    "--out",
    path,
    "--width",
    String(w),
    "--height",
    String(h),
    "--no-layers",
  ]);
}
for (let i = 0; i < 8; i++) {
  for (let s = 0; s < 4; s++)
    emit(gem(i, s), `${root}/gems/${names[i]}-${s}.png`);
  if (i < 7)
    for (let f = 0; f < 6; f++) {
      const cv = createCanvas(64, 64),
        c = cv.getContext("2d"),
        src = gem(i, Math.min(3, f));
      for (let q = 0; q < 4; q++) {
        c.save();
        c.globalAlpha = 1 - f / 7;
        c.translate((q % 2 ? 1 : -1) * f * 2, (q < 2 ? -1 : 1) * f * 2);
        c.drawImage(
          src,
          (q % 2) * 32,
          Math.floor(q / 2) * 32,
          32,
          32,
          (q % 2) * 32,
          Math.floor(q / 2) * 32,
          32,
          32,
        );
        c.restore();
      }
      emit(cv, `${root}/gems/break/${names[i]}/${f}.png`, true);
    }
}
for (let f = 0; f < 8; f++)
  emit(gem(7, 0, (f * Math.PI) / 4), `${root}/gems/prism-turn/${f}.png`, true);
for (const name of ["brilliant", "star"]) {
  const cv = createCanvas(64, 64),
    c = cv.getContext("2d");
  c.strokeStyle = "#fff5c9";
  c.lineWidth = 2;
  c.beginPath();
  if (name === "brilliant") {
    c.moveTo(32, 5);
    c.lineTo(58, 32);
    c.lineTo(32, 59);
    c.lineTo(6, 32);
    c.closePath();
  } else
    for (let j = 0; j < 16; j++) {
      let a = (j * Math.PI) / 8,
        r = j % 2 ? 12 : 28;
      let x = 32 + Math.sin(a) * r,
        y = 32 + Math.cos(a) * r;
      if (!j) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
  c.closePath();
  c.stroke();
  emit(cv, `${root}/gems/${name}.png`);
}
const frame = createCanvas(616, 616),
  c = frame.getContext("2d");
c.fillStyle = "#172d36";
c.fillRect(0, 0, 616, 616);
c.fillStyle = "#b8a77c";
c.fillRect(3, 3, 610, 610);
c.fillStyle = "#0a1a24";
c.fillRect(5, 5, 606, 606);
c.fillStyle = "#26424a";
c.fillRect(15, 15, 586, 586);
c.fillStyle = "#09151e";
c.fillRect(20, 20, 576, 576);
for (let y = 0; y < 8; y++)
  for (let x = 0; x < 8; x++) {
    c.fillStyle = (x + y) % 2 ? "#10232c" : "#132831";
    c.fillRect(21 + x * 72, 21 + y * 72, 70, 70);
    c.fillStyle = "#23404a";
    c.fillRect(21 + x * 72, 21 + y * 72, 70, 1);
  }
for (const x of [9, 601])
  for (const y of [9, 601]) {
    c.fillStyle = "#e4cc93";
    c.fillRect(x - 2, y - 2, 5, 5);
  }
emit(frame, `${root}/gems/frame.png`);
