import { spawn } from 'child_process';
import sharp from 'sharp';

/**
 * Ozon video cover («Озон.Видеообложка», attribute 21845): an 8-second slideshow of the
 * book's photos. Ozon accepts 8–30 s, ≤ 20 MB, 3:4, no frames/fields; the client wants
 * exactly 8 s. Every photo gets the same effect: fitted whole into 3:4 over a blurred copy
 * of itself, slow zoom, crossfades between photos.
 *
 * Frames are drawn one at a time with sharp (sub-pixel zoom via affine, so no 1-px jitter)
 * and piped raw to ffmpeg, which only encodes. A pure-ffmpeg filter graph queued frames of
 * the later photos and peaked at ~400 MB — too much for the 512 MB backend container.
 * This way: ffmpeg ~95 MB + a few frames in Node, ~18 s on one laptop core.
 */
export const VIDEO_COVER = {
  // 3:4 with a 1080-px long side: half the work of 1080×1440, same look on a phone
  WIDTH: 810,
  HEIGHT: 1080,
  FPS: 25,
  DURATION_S: 8,
  CROSSFADE_S: 0.5,
  /** the cover (first photo) stays this much longer than the others */
  COVER_SHARE: 1.15,
  /** zoom gained over one photo's time on screen */
  ZOOM: 0.05,
  MAX_BYTES: 20 * 1024 * 1024,
} as const;

export interface VideoCoverOptions {
  ffmpegPath?: string;
  /** x264 preset; `veryfast` keeps the 1-vCPU server at ~1 min per book */
  preset?: string;
  /** encoder threads (1 on the server, more on a workstation) */
  threads?: number;
}

/** Start time and duration of each photo; consecutive photos overlap by the crossfade. */
export function segmentTimings(count: number): { starts: number[]; durations: number[] } {
  if (count < 1) throw new Error('No photos');
  const { DURATION_S: total, CROSSFADE_S: xf, COVER_SHARE: share } = VIDEO_COVER;
  if (count === 1) return { starts: [0], durations: [total] };
  // sum(durations) - (count - 1) * xf = total, cover = share * rest
  const rest = (total + (count - 1) * xf) / (share + (count - 1));
  const durations = Array.from({ length: count }, (_, i) => (i === 0 ? rest * share : rest));
  const starts: number[] = [];
  let t = 0;
  for (const d of durations) {
    starts.push(t);
    t += d - xf;
  }
  return { starts, durations };
}

/** The photo fitted whole into W×H over a blurred, slightly darkened copy of itself. Raw RGB. */
async function composeBase(photo: Buffer): Promise<Buffer> {
  const { WIDTH: W, HEIGHT: H } = VIDEO_COVER;
  const small = await sharp(photo)
    .rotate()
    .resize(Math.round(W / 8), Math.round(H / 8), { fit: 'cover' })
    .blur(4)
    .modulate({ brightness: 0.92 })
    .toBuffer();
  const background = await sharp(small).resize(W, H, { fit: 'fill' }).toBuffer();
  const foreground = await sharp(photo).rotate().resize(W, H, { fit: 'inside' }).toBuffer();
  return sharp(background)
    .composite([{ input: foreground, gravity: 'centre' }])
    .removeAlpha()
    .raw()
    .toBuffer();
}

/** Zoom by `z` about the centre with sub-pixel precision (the fraction goes into the affine offset). */
async function zoomFrame(base: Buffer, z: number): Promise<Buffer> {
  const { WIDTH: W, HEIGHT: H } = VIDEO_COVER;
  const ox = (W * z - W) / 2;
  const oy = (H * z - H) / 2;
  const left = Math.floor(ox);
  const top = Math.floor(oy);
  const { data, info } = await sharp(base, { raw: { width: W, height: H, channels: 3 } })
    .affine([z, 0, 0, z], { interpolator: 'bicubic', odx: -(ox - left), ody: -(oy - top) })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } })
    .extract({ left, top, width: W, height: H })
    .raw()
    .toBuffer();
}

function blend(a: Buffer, b: Buffer, t: number): Buffer {
  const out = Buffer.allocUnsafe(a.length);
  const k = Math.round(Math.min(Math.max(t, 0), 1) * 256);
  const j = 256 - k;
  for (let i = 0; i < a.length; i++) out[i] = (a[i] * j + b[i] * k) >> 8;
  return out;
}

/** Renders the video cover for `photos` (in display order, cover first) into `outPath` (MP4). */
export async function renderVideoCover(
  photos: Buffer[],
  outPath: string,
  options: VideoCoverOptions = {},
): Promise<void> {
  const { WIDTH: W, HEIGHT: H, FPS, DURATION_S, CROSSFADE_S, ZOOM } = VIDEO_COVER;
  const { starts, durations } = segmentTimings(photos.length);

  const ff = spawn(
    options.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-y', '-v', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
      '-an', '-c:v', 'libx264', '-preset', options.preset || 'veryfast', '-crf', '22',
      '-pix_fmt', 'yuv420p', '-threads', String(options.threads ?? 1),
      '-movflags', '+faststart', outPath,
    ],
    { stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let stderr = '';
  ff.stderr.on('data', (d) => (stderr += d));
  const exited = new Promise<number | null>((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', resolve);
  });
  // ignore EPIPE here; a dead ffmpeg is reported through its exit code below
  ff.stdin.on('error', () => undefined);
  const write = (frame: Buffer) =>
    new Promise<void>((resolve) => (ff.stdin.write(frame) ? resolve() : ff.stdin.once('drain', resolve)));

  try {
    // only the photos currently on screen are kept in memory
    const bases = new Map<number, Buffer>();
    const base = async (i: number) => {
      let b = bases.get(i);
      if (!b) {
        b = await composeBase(photos[i]);
        bases.set(i, b);
      }
      return b;
    };
    const frameOf = async (i: number, t: number) =>
      zoomFrame(await base(i), 1 + ZOOM * Math.min(t / durations[i], 1));

    const frames = Math.round(DURATION_S * FPS);
    for (let f = 0; f < frames; f++) {
      if (ff.exitCode !== null) break;
      const t = f / FPS;
      const active = starts
        .map((s, i) => i)
        .filter((i) => t >= starts[i] && t < starts[i] + durations[i]);
      if (!active.length) active.push(photos.length - 1); // float edge at the very end
      for (const k of [...bases.keys()]) if (k < active[0]) bases.delete(k);

      let frame: Buffer;
      if (active.length === 1) {
        frame = await frameOf(active[0], t - starts[active[0]]);
      } else {
        const [a, b] = active;
        const [fa, fb] = await Promise.all([frameOf(a, t - starts[a]), frameOf(b, t - starts[b])]);
        frame = blend(fa, fb, (t - starts[b]) / CROSSFADE_S);
      }
      await write(frame);
    }
  } finally {
    ff.stdin.end();
  }

  const code = await exited;
  if (code !== 0) throw new Error(`ffmpeg exited with ${code}: ${stderr.trim().slice(-500)}`);
}
