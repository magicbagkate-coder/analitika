import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { firstValueFrom } from 'rxjs';
import { buildFfmpegArgs } from './compression-plan';
import { TouchVideoStoreService } from './touch-video-store.service';

const runCommand = promisify(execFile);
const DOWNLOAD_TIMEOUT_MS = 120_000;
const LOW_PRIORITY = '15';

/**
 * Makes the light copy of a touch video: downloads the original from Drive, shrinks it with ffmpeg at low CPU
 * priority and keeps the result next to the others. One video at a time, whoever asks — the server stays calm
 * and the same file is never made twice at once. A failure is reported as "no copy", and the caller sends the
 * original instead.
 */
@Injectable()
export class TouchVideoCompressorService {
  private readonly logger = new Logger(TouchVideoCompressorService.name);
  private readonly running = new Map<string, Promise<boolean>>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly httpService: HttpService,
    private readonly touchVideoStoreService: TouchVideoStoreService,
  ) {}

  /** True when a compressed copy of the file is on the disk afterwards. */
  async ensureCompressed(fileId: string): Promise<boolean> {
    if (!this.touchVideoStoreService.isEnabled()) return false;
    if (await this.touchVideoStoreService.exists(fileId)) return true;
    return this.running.get(fileId) ?? this.enqueue(fileId);
  }

  private enqueue(fileId: string): Promise<boolean> {
    const job = this.queue.then(() => this.tryCompress(fileId));
    this.queue = job;
    this.running.set(fileId, job);
    void job.finally(() => this.running.delete(fileId));
    return job;
  }

  private async tryCompress(fileId: string): Promise<boolean> {
    const finalPath = this.touchVideoStoreService.filePath(fileId);
    const sourcePath = `${finalPath}.source`;
    const partPath = `${finalPath}.part.mp4`;
    try {
      await this.touchVideoStoreService.ensureDirectory();
      await this.download({ fileId, targetPath: sourcePath });
      const durationSeconds = await this.readDuration(sourcePath);
      const args = buildFfmpegArgs({ inputPath: sourcePath, outputPath: partPath, durationSeconds });
      await runCommand('nice', ['-n', LOW_PRIORITY, 'ffmpeg', ...args]);
      await rename(partPath, finalPath);
      this.logger.log(`Compressed video ${fileId} (${Math.round(durationSeconds)} s)`);
      return true;
    } catch (error) {
      this.logger.warn(`Could not compress video ${fileId}, the original will be sent: ${(error as Error).message}`);
      return false;
    } finally {
      await Promise.all([rm(sourcePath, { force: true }), rm(partPath, { force: true })]);
    }
  }

  private async download(params: { fileId: string; targetPath: string }): Promise<void> {
    const url = `https://drive.usercontent.google.com/download?id=${params.fileId}&export=download`;
    const response = await firstValueFrom(this.httpService.get(url, { responseType: 'stream', timeout: DOWNLOAD_TIMEOUT_MS }));
    await pipeline(response.data, createWriteStream(params.targetPath));
  }

  private async readDuration(path: string): Promise<number> {
    const { stdout } = await runCommand('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path]);
    const seconds = Number(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Could not read the video length');
    return seconds;
  }
}
