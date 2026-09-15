import { Module } from '@nestjs/common';
import { ManagerCharacteristicsModule } from '../manager-characteristics/manager-characteristics.module';
import { OrderSuccessAnalysisModule } from '../order-success-analysis/order-success-analysis.module';
import { StatusReportModule } from '../status-report/status-report.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ReportSchedulerService } from './report-scheduler.service';

@Module({
  imports: [OrderSuccessAnalysisModule, StatusReportModule, ManagerCharacteristicsModule, TelegramModule],
  providers: [ReportSchedulerService],
  exports: [ReportSchedulerService],
})
export class ReportSchedulerModule {}
