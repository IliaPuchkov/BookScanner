/**
 * Child-process entry: `node render-worker.js <out.mp4> <photo1> [photo2 ...]`.
 * The backend runs it under `nice` so a render never starves the API on the 1-vCPU host.
 */
import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { renderVideoCover } from './render-video-cover';

sharp.cache(false);
sharp.concurrency(1);

async function main() {
  const [out, ...photoPaths] = process.argv.slice(2);
  if (!out || !photoPaths.length) {
    console.error('usage: render-worker <out.mp4> <photo1> [photo2 ...]');
    process.exit(2);
  }
  const photos = await Promise.all(photoPaths.map((p) => readFile(p)));
  await renderVideoCover(photos, out, { threads: 1 });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
