import { Module } from '@nestjs/common';
import { ReportRunStatusService } from './report-run-status.service';

@Module({
  providers: [ReportRunStatusService],
  exports: [ReportRunStatusService],
})
export class ReportRunStatusModule {}
