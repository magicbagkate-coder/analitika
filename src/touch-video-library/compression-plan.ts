const TARGET_SIZE_BYTES = 9 * 1024 * 1024;
const AUDIO_KBPS = 96;
const MAX_VIDEO_KBPS = 2500;
const MIN_VIDEO_KBPS = 500;
const OUTPUT_WIDTH = 720;
const QUALITY = '27';

/**
 * How many kilobits per second the picture may take for the whole video to stay near 9 MB: a short clip gets a
 * generous cap, a minute-long one a tighter one (owner, 2026-11-26: big files made Sitniks send twice and
 * Telegram refuse them, small ones went through).
 */
export function videoBitrateKbps(durationSeconds: number): number {
  const totalKbps = (TARGET_SIZE_BYTES * 8) / 1000 / durationSeconds;
  return Math.min(MAX_VIDEO_KBPS, Math.max(MIN_VIDEO_KBPS, Math.round(totalKbps - AUDIO_KBPS)));
}

export type CompressionParams = { inputPath: string; outputPath: string; durationSeconds: number };

/** ffmpeg arguments: 720 px wide (never enlarged), constant quality with a bitrate cap, fast start for phones. */
export function buildFfmpegArgs(params: CompressionParams): string[] {
  const bitrate = videoBitrateKbps(params.durationSeconds);
  return [
    '-y', '-v', 'error',
    '-i', params.inputPath,
    '-vf', `scale=min(${OUTPUT_WIDTH}\\,iw):-2`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', QUALITY,
    '-maxrate', `${bitrate}k`, '-bufsize', `${bitrate * 2}k`,
    '-threads', '2',
    '-c:a', 'aac', '-b:a', `${AUDIO_KBPS}k`,
    '-movflags', '+faststart',
    params.outputPath,
  ];
}
