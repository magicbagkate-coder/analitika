import { Module } from '@nestjs/common';
import { EvaluationHistoryModule } from '../evaluation-history/evaluation-history.module';
import { ManagerCharacteristicsModule } from '../manager-characteristics/manager-characteristics.module';
import { OrderSuccessAnalysisModule } from '../order-success-analysis/order-success-analysis.module';
import { ReportRunStatusModule } from '../report-run-status/report-run-status.module';
import { StatusReportModule } from '../status-report/status-report.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ReportSchedulerService } from './report-scheduler.service';

@Module({
  imports: [
    OrderSuccessAnalysisModule,
    StatusReportModule,
    ManagerCharacteristicsModule,
    TelegramModule,
    ReportRunStatusModule,
    EvaluationHistoryModule,
  ],
  providers: [ReportSchedulerService],
  exports: [ReportSchedulerService],
})
export class ReportSchedulerModule {}
