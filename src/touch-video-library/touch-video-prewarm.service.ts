import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { ReportRunStatusService } from '../report-run-status/report-run-status.service';
import { TouchVideoCompressorService } from './touch-video-compressor.service';
import { TouchVideoLibraryService } from './touch-video-library.service';
import { TouchVideoStoreService } from './touch-video-store.service';

const FIRST_ROUND_DELAY_MS = 30_000;
const ROUND_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Makes the light copy of every video in the folder ahead of time, one after another, so a touch never waits
 * for a compression. New videos the owner uploads are picked up on the next round. It pauses while the
 * twice-daily report runs, and it does nothing at all while the touch bot is off.
 */
@Injectable()
export class TouchVideoPrewarmService implements OnModuleInit {
  private readonly logger = new Logger(TouchVideoPrewarmService.name);
  private working = false;

  constructor(
    private readonly appConfig: AppConfigService,
    private readonly reportRunStatusService: ReportRunStatusService,
    private readonly touchVideoStoreService: TouchVideoStoreService,
    private readonly touchVideoLibraryService: TouchVideoLibraryService,
    private readonly touchVideoCompressorService: TouchVideoCompressorService,
  ) {}

  onModuleInit(): void {
    if (this.appConfig.getTouchMode() === 'off' || !this.touchVideoStoreService.isEnabled()) return;
    setTimeout(() => this.startRound(), FIRST_ROUND_DELAY_MS);
    setInterval(() => this.startRound(), ROUND_INTERVAL_MS);
  }

  private startRound(): void {
    this.compressMissing().catch((error) => this.logger.warn(`Video preparation round failed: ${(error as Error).message}`));
  }

  private async compressMissing(): Promise<void> {
    if (this.working) return;
    this.working = true;
    try {
      const videos = await this.touchVideoLibraryService.listVideos();
      for (const video of videos) {
        if (this.reportRunStatusService.isBusy()) return;
        if (await this.touchVideoStoreService.exists(video.fileId)) continue;
        await this.touchVideoCompressorService.ensureCompressed(video.fileId);
      }
    } finally {
      this.working = false;
    }
  }
}
