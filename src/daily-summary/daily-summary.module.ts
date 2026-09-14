import { Module } from '@nestjs/common';
import { DailyStatsStoreModule } from '../daily-stats-store/daily-stats-store.module';
import { TelegramModule } from '../telegram/telegram.module';
import { DailySummaryService } from './daily-summary.service';

@Module({
  imports: [DailyStatsStoreModule, TelegramModule],
  providers: [DailySummaryService],
})
export class DailySummaryModule {}
