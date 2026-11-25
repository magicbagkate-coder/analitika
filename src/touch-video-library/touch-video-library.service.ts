import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
import { parseFolderListing, type VideoFile } from './parse-folder-listing';

const LISTING_URL = 'https://drive.google.com/embeddedfolderview';
const REQUEST_TIMEOUT_MS = 30_000;
const CACHE_MS = 10 * 60 * 1000;
// A listing that suddenly shrinks is far more likely a broken page than a mass deletion.
const SHRINK_WARNING_RATIO = 0.5;

/**
 * The videos in the owner's public Drive folder (TOUCH_VIDEO_FOLDER_ID), read from the folder's public
 * list page — there is no Drive key on the server. The page is not an official API, so the list is kept
 * for 10 minutes and the last good list is reused if a fetch fails.
 */
@Injectable()
export class TouchVideoLibraryService {
  private readonly logger = new Logger(TouchVideoLibraryService.name);
  private cached: { files: VideoFile[]; loadedAt: number } | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly appConfig: AppConfigService,
  ) {}

  async listVideos(): Promise<VideoFile[]> {
    if (this.cached && Date.now() - this.cached.loadedAt < CACHE_MS) return this.cached.files;

    try {
      const files = await this.fetchListing();
      this.warnOnShrink(files);
      this.cached = { files, loadedAt: Date.now() };
      return files;
    } catch (error) {
      if (!this.cached) throw error;
      this.logger.warn(`Could not refresh the video folder, using the last list: ${(error as Error).message}`);
      return this.cached.files;
    }
  }

  private async fetchListing(): Promise<VideoFile[]> {
    const folderId = this.appConfig.getTouchVideoFolderId();
    if (!folderId) throw new Error('TOUCH_VIDEO_FOLDER_ID is not set');

    const response = await firstValueFrom(this.httpService.get<string>(LISTING_URL, { params: { id: folderId }, timeout: REQUEST_TIMEOUT_MS, responseType: 'text' }));
    const files = parseFolderListing(response.data);
    if (files.length === 0) throw new Error('The video folder page held no videos (a changed page or a private folder)');
    return files;
  }

  private warnOnShrink(files: VideoFile[]): void {
    const previous = this.cached?.files.length ?? 0;
    if (previous > 0 && files.length < previous * SHRINK_WARNING_RATIO) {
      this.logger.warn(`The video folder list shrank from ${previous} to ${files.length} files`);
    }
  }
}
