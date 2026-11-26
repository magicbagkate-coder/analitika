import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ReportRunStatusModule } from '../report-run-status/report-run-status.module';
import { TouchVideoCompressorService } from './touch-video-compressor.service';
import { TouchVideoLibraryService } from './touch-video-library.service';
import { TouchVideoPrewarmService } from './touch-video-prewarm.service';
import { TouchVideoStoreService } from './touch-video-store.service';

@Module({
  imports: [HttpModule, ReportRunStatusModule],
  providers: [TouchVideoLibraryService, TouchVideoStoreService, TouchVideoCompressorService, TouchVideoPrewarmService],
  exports: [TouchVideoLibraryService, TouchVideoStoreService, TouchVideoCompressorService],
})
export class TouchVideoLibraryModule {}
