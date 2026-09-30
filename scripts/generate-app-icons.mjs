// Generates the app icons (PWA, iOS home screen, favicon) from the TK sign:
// the white sign on the club's blue gradient. Run after changing the logo:
//   node scripts/generate-app-icons.mjs
// Uses sharp, which Next.js installs for image optimisation.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const signSvg = await readFile(path.join(root, "public/brand/Koskovi_logo_znak.svg"), "utf8");
// The sign's paths without the Illustrator wrapper, recoloured white.
const signPath = signSvg.match(/<path[^>]*d="([^"]+)"/)[1];
const signWidth = 70.87;
const signHeight = 62.36;

// `signScale` is the sign's width as a share of the icon. Maskable icons keep
// it inside the central safe zone, because Android may crop them to a circle.
function iconSvg(size, signScale, rounded) {
  const width = size * signScale;
  const height = (width / signWidth) * signHeight;
  const x = (size - width) / 2;
  // Optically centred: the sign is heavier at the bottom.
  const y = (size - height) / 2 - size * 0.01;
  const radius = rounded ? size * 0.22 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#003758"/>
      <stop offset="0.48" stop-color="#014d76"/>
      <stop offset="1" stop-color="#008fcc"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
  <g transform="translate(${x} ${y}) scale(${width / signWidth})">
    <path fill="#ffffff" d="${signPath}"/>
  </g>
</svg>`;
}

const outputs = [
  // PWA manifest icons.
  { file: "public/icons/icon-192.png", size: 192, signScale: 0.6 },
  { file: "public/icons/icon-512.png", size: 512, signScale: 0.6 },
  { file: "public/icons/icon-maskable-512.png", size: 512, signScale: 0.48 },
  // iOS home screen (iOS rounds the corners itself).
  { file: "src/app/apple-icon.png", size: 180, signScale: 0.6 },
  // Browser tab; rounded so it does not look like a square block.
  { file: "src/app/icon.png", size: 64, signScale: 0.66, rounded: true },
];

await mkdir(path.join(root, "public/icons"), { recursive: true });

for (const { file, rounded = false, signScale, size } of outputs) {
  const png = await sharp(Buffer.from(iconSvg(size, signScale, rounded))).png().toBuffer();

  await writeFile(path.join(root, file), png);
  console.log(`${file} (${size}×${size})`);
}
