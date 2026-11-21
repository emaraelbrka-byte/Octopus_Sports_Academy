// Makes the web images from the original photos in /pic.  Run:  npm run images
//
// For each photo it writes, into public/img:
//   <name>.avif  smallest file, used by every modern browser
//   <name>.webp  fallback for browsers without AVIF
//   <name>.jpg   last fallback (very old browsers)
// at every width listed (the first width keeps the plain name, others get "-<width>").
// It also makes a tiny blurred preview of the home banner and writes it into style.css
// (between the "blur:start" and "blur:end" markers), so a soft picture shows the moment the page opens.
//
// sharp is only needed here, on the computer that prepares the images; the website itself never runs it.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'pic');
const OUT = path.join(ROOT, 'public', 'img');
const CSS = path.join(ROOT, 'public', 'style.css');

// AVIF at quality ~42 looks about like WebP ~64 and JPEG ~72 here, at a fraction of the size
const QUALITY = { avif: 42, webp: 64, jpg: 72 };

const IMAGES = [
  // Home banner: 1600 px for computers, 900 px for phones
  { source: 'pexels-matthew-2148834898-30298285.jpg', name: 'hero', widths: [1600, 900], blur: true },
  // Photo panel next to the log-in form (computers only)
  { source: 'pexels-aleksey-kuprikov-1883853-6367706.jpg', name: 'towers', widths: [800] },
];

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

async function build({ source, name, widths, blur }) {
  const input = path.join(SRC, source);
  if (!fs.existsSync(input)) throw new Error(`Missing original photo: pic/${source}`);
  for (const [i, width] of widths.entries()) {
    const base = i === 0 ? name : `${name}-${width}`;
    const resized = sharp(input).rotate().resize({ width, withoutEnlargement: true });
    const sizes = [];
    for (const [ext, run] of [
      ['avif', (img) => img.avif({ quality: QUALITY.avif, effort: 6 })],
      ['webp', (img) => img.webp({ quality: QUALITY.webp, effort: 6 })],
      ['jpg', (img) => img.jpeg({ quality: QUALITY.jpg, mozjpeg: true })],
    ]) {
      const file = path.join(OUT, `${base}.${ext}`);
      await run(resized.clone()).toFile(file);
      sizes.push(`${ext} ${kb(fs.statSync(file).size)}`);
    }
    console.log(`${base.padEnd(10)} ${String(width).padStart(5)} px   ${sizes.join('  ·  ')}`);
  }
  if (blur) await writeBlurPreview(input, name);
}

// A 32 px wide, blurred WebP (well under 1 KB) put straight into the stylesheet as a data URL
async function writeBlurPreview(input, name) {
  const buf = await sharp(input).rotate().resize({ width: 32 }).blur(1.2).webp({ quality: 40 }).toBuffer();
  const rule = `.hero { background-image: url("data:image/webp;base64,${buf.toString('base64')}"); background-size: cover; background-position: center 60%; }`;
  let css = fs.readFileSync(CSS, 'utf8');
  const nl = css.includes('\r\n') ? '\r\n' : '\n';
  const block = `/* blur:start (made by npm run images: tiny blurred ${name} shown while the real photo loads) */${nl}${rule}${nl}/* blur:end */`;
  css = /\/\* blur:start[\s\S]*?\/\* blur:end \*\//.test(css)
    ? css.replace(/\/\* blur:start[\s\S]*?\/\* blur:end \*\//, block)
    : `${css.replace(/\s*$/, '')}${nl}${nl}${block}${nl}`;
  fs.writeFileSync(CSS, css);
  console.log(`blur preview for ${name}: ${buf.length} bytes, written into style.css`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const image of IMAGES) await build(image);
  console.log('Done. Reload the site (npm run pm2:reload) so the new files get new version numbers.');
})().catch((err) => {
  console.error('Image build failed:', err.message);
  process.exit(1);
});
