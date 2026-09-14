import { Global, Module } from '@nestjs/common';
import { DailyStatsStoreService } from './daily-stats-store.service';

@Global()
@Module({
  providers: [DailyStatsStoreService],
  exports: [DailyStatsStoreService],
})
export class DailyStatsStoreModule {}
