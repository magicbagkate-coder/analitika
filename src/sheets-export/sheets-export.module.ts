import { Module } from '@nestjs/common';
import { EvaluationHistoryModule } from '../evaluation-history/evaluation-history.module';
import { ReplyTimesModule } from '../reply-times/reply-times.module';
import { ReportTextsModule } from '../report-texts/report-texts.module';
import { GoogleSheetsClient } from './google-sheets.client';
import { SheetsExportService } from './sheets-export.service';

@Module({
  imports: [EvaluationHistoryModule, ReplyTimesModule, ReportTextsModule],
  providers: [GoogleSheetsClient, SheetsExportService],
  exports: [SheetsExportService],
})
export class SheetsExportModule {}
