import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFfmpegArgs, videoBitrateKbps } from './compression-plan';
import { TouchVideoStoreService } from './touch-video-store.service';

describe('videoBitrateKbps', () => {
  it('gives a short clip the generous cap', () => {
    expect(videoBitrateKbps(24)).toBe(2500);
  });

  it('gives a minute-long clip a tighter one, so it still stays near 9 MB', () => {
    const kbps = videoBitrateKbps(56);
    expect(kbps).toBeGreaterThan(1100);
    expect(kbps).toBeLessThan(1300);
  });

  it('never goes below a bitrate that still looks like a picture', () => {
    expect(videoBitrateKbps(900)).toBe(500);
  });
});

describe('buildFfmpegArgs', () => {
  it('shrinks to 720 px wide without enlarging and keeps the bitrate cap', () => {
    const args = buildFfmpegArgs({ inputPath: '/in.mp4', outputPath: '/out.mp4', durationSeconds: 56 });
    expect(args).toContain('scale=min(720\\,iw):-2');
    expect(args[args.indexOf('-i') + 1]).toBe('/in.mp4');
    expect(args[args.length - 1]).toBe('/out.mp4');
    expect(args[args.indexOf('-maxrate') + 1]).toMatch(/^\d+k$/);
  });
});

function storeWith(params: { publicUrl: string | null; directory: string }): TouchVideoStoreService {
  const config = { getTouchVideoPublicUrl: () => params.publicUrl, getTouchVideoDir: () => params.directory };
  return new TouchVideoStoreService(config as never);
}

describe('TouchVideoStoreService', () => {
  it('sends the original Drive link when compression is not switched on', async () => {
    const url = await storeWith({ publicUrl: null, directory: tmpdir() }).buildSendUrl('abc123');
    expect(url).toBe('https://drive.usercontent.google.com/download?id=abc123&export=download&name=abc123.mp4');
  });

  it('sends the original while no light copy exists, and the light copy once it does', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'touch-videos-'));
    const store = storeWith({ publicUrl: 'http://server.example:3000', directory });

    expect(await store.buildSendUrl('abc123')).toContain('drive.usercontent.google.com');
    await writeFile(join(directory, 'abc123.mp4'), 'x');
    expect(await store.buildSendUrl('abc123')).toBe('http://server.example:3000/touch-videos/abc123.mp4');
  });

  it('refuses a file id that could point outside the folder', () => {
    expect(() => storeWith({ publicUrl: 'http://s', directory: tmpdir() }).filePath('../../etc/passwd')).toThrow('Unexpected Drive file id');
  });
});
