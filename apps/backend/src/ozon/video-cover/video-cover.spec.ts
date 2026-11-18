import { segmentTimings, VIDEO_COVER } from './render-video-cover';
import { photosHash } from './video-cover.service';

describe('segmentTimings', () => {
  const end = (n: number) => {
    const { starts, durations } = segmentTimings(n);
    return starts[n - 1] + durations[n - 1];
  };

  it.each([1, 2, 3, 4, 5, 8, 10])('%i photos fill exactly 8 s', (n) => {
    expect(end(n)).toBeCloseTo(VIDEO_COVER.DURATION_S, 9);
  });

  it('shows the cover longer than the other photos', () => {
    const { durations } = segmentTimings(4);
    expect(durations[0]).toBeCloseTo(durations[1] * VIDEO_COVER.COVER_SHARE, 9);
    expect(durations.slice(1).every((d) => d === durations[1])).toBe(true);
  });

  it('overlaps neighbours by the crossfade', () => {
    const { starts, durations } = segmentTimings(4);
    for (let i = 1; i < 4; i++) {
      expect(starts[i - 1] + durations[i - 1] - starts[i]).toBeCloseTo(VIDEO_COVER.CROSSFADE_S, 9);
    }
  });

  it('keeps every photo on screen longer than its crossfades', () => {
    const { durations } = segmentTimings(10);
    expect(Math.min(...durations)).toBeGreaterThan(2 * VIDEO_COVER.CROSSFADE_S);
  });

  it('rejects an empty photo list', () => {
    expect(() => segmentTimings(0)).toThrow();
  });

  it('renders a whole number of frames in exactly 8 s', () => {
    expect(VIDEO_COVER.DURATION_S * VIDEO_COVER.FPS % 1).toBe(0);
    expect(VIDEO_COVER.WIDTH / VIDEO_COVER.HEIGHT).toBe(3 / 4);
  });
});

describe('photosHash', () => {
  const a = { fileUrl: 'https://s/a.jpg', sortOrder: 0 };
  const b = { fileUrl: 'https://s/b.jpg', sortOrder: 1 };

  it('is 16 hex chars and ignores array order', () => {
    expect(photosHash([a, b])).toMatch(/^[0-9a-f]{16}$/);
    expect(photosHash([b, a])).toBe(photosHash([a, b]));
  });

  it('changes when photos are reordered, replaced or removed', () => {
    const base = photosHash([a, b]);
    expect(photosHash([{ ...a, sortOrder: 1 }, { ...b, sortOrder: 0 }])).not.toBe(base);
    expect(photosHash([a, { ...b, fileUrl: 'https://s/c.jpg' }])).not.toBe(base);
    expect(photosHash([a])).not.toBe(base);
  });
});
