/**
 * Rasterizes the seal into site/public/ and verifies every output.
 *
 * Wrong output is a hard failure, not a warning — the same stance
 * henry-mascot/scripts/generate.js takes. A silently wrong favicon is worse
 * than a failed build.
 *
 * Run: npm run brand:build
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { sealSvg } from "./seal.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "public");

const full = sealSvg({ lettering: true });
const small = sealSvg({ lettering: false });

// Guard the invariant at build time as well as in tests: a <text> element here
// would rasterize differently on a machine without the font installed.
for (const [name, svg] of [["full", full], ["small", small]]) {
  if (/<text[\s>]/.test(svg)) {
    throw new Error(`${name} seal contains a <text> element; glyphs must be outlined paths`);
  }
}

/** Rasterize at the target size directly — never upsample a smaller bitmap. */
async function render(svg, width, height = width) {
  return sharp(Buffer.from(svg), { density: (72 * width) / 512 })
    .resize(width, height)
    .png()
    .toBuffer();
}

const PNG_OUTPUTS = [
  { file: "favicon-16x16.png", svg: small, width: 16 },
  { file: "favicon-32x32.png", svg: small, width: 32 },
  { file: "apple-touch-icon.png", svg: full, width: 180 },
  { file: "android-chrome-192x192.png", svg: full, width: 192 },
  { file: "android-chrome-512x512.png", svg: full, width: 512 },
  { file: "beadz-token-256.png", svg: full, width: 256 },
  { file: "beadz-token-512.png", svg: full, width: 512 },
];

const ICO_LAYERS = [
  { svg: small, width: 16 },
  { svg: small, width: 32 },
  { svg: small, width: 48 },
];

async function ogImage() {
  // 1200x630 with the seal centred on the ground colour.
  const seal = await render(full, 520);
  return sharp({
    create: {
      width: 1200, height: 630, channels: 4,
      background: { r: 0x1b, g: 0x14, b: 0x0c, alpha: 1 },
    },
  })
    .composite([{ input: seal, top: 55, left: 340 }])
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  fs.writeFileSync(path.join(OUT, "beadz-seal.svg"), full);
  fs.writeFileSync(path.join(OUT, "beadz-seal-small.svg"), small);

  for (const { file, svg, width } of PNG_OUTPUTS) {
    fs.writeFileSync(path.join(OUT, file), await render(svg, width));
  }

  const ico = await pngToIco(
    await Promise.all(ICO_LAYERS.map(({ svg, width }) => render(svg, width)))
  );
  fs.writeFileSync(path.join(OUT, "favicon.ico"), ico);

  fs.writeFileSync(path.join(OUT, "og-image.png"), await ogImage());

  // ---- verification: wrong output is a hard failure ----
  for (const { file, width } of PNG_OUTPUTS) {
    const meta = await sharp(path.join(OUT, file)).metadata();
    if (meta.width !== width || meta.height !== width) {
      throw new Error(`${file}: expected ${width}x${width}, got ${meta.width}x${meta.height}`);
    }
  }

  const og = await sharp(path.join(OUT, "og-image.png")).metadata();
  if (og.width !== 1200 || og.height !== 630) {
    throw new Error(`og-image.png: expected 1200x630, got ${og.width}x${og.height}`);
  }

  const layers = fs.readFileSync(path.join(OUT, "favicon.ico")).readUInt16LE(4);
  if (layers !== ICO_LAYERS.length) {
    throw new Error(`favicon.ico: expected ${ICO_LAYERS.length} layers, got ${layers}`);
  }

  console.log(
    `brand: ${PNG_OUTPUTS.length} PNGs + og-image + favicon.ico (${ICO_LAYERS.map((l) => l.width).join("/")}) + 2 SVGs`
  );
  console.log("All outputs generated and verified.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
