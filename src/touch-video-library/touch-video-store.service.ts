import { Injectable } from '@nestjs/common';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfigService } from '../config/app-config.service';
import { buildVideoUrl } from './build-video-url';

const DRIVE_FILE_ID = /^[A-Za-z0-9_-]+$/;
export const TOUCH_VIDEO_URL_PREFIX = '/touch-videos';

/**
 * Where the compressed copies of the touch videos live and how they are reached: on the server's disk, and from
 * outside at TOUCH_VIDEO_PUBLIC_URL (Sitniks downloads a video from a link). Without that setting nothing is
 * compressed and the original Drive link is sent, as before.
 */
@Injectable()
export class TouchVideoStoreService {
  constructor(private readonly appConfig: AppConfigService) {}

  isEnabled(): boolean {
    return this.appConfig.getTouchVideoPublicUrl() !== null;
  }

  get directory(): string {
    return this.appConfig.getTouchVideoDir();
  }

  async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
  }

  /** A Drive id is only letters, digits, "-" and "_": anything else never becomes a path on the disk. */
  filePath(fileId: string): string {
    if (!DRIVE_FILE_ID.test(fileId)) throw new Error(`Unexpected Drive file id: ${fileId}`);
    return join(this.directory, `${fileId}.mp4`);
  }

  async exists(fileId: string): Promise<boolean> {
    try {
      await access(this.filePath(fileId));
      return true;
    } catch {
      return false;
    }
  }

  /** The link Sitniks gets: the compressed copy when there is one, else the original on Drive. */
  async buildSendUrl(fileId: string): Promise<string> {
    const publicUrl = this.appConfig.getTouchVideoPublicUrl();
    if (publicUrl === null || !(await this.exists(fileId))) return buildVideoUrl(fileId);
    return `${publicUrl}${TOUCH_VIDEO_URL_PREFIX}/${fileId}.mp4`;
  }
}
