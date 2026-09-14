import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module';
import { EvaluationHistoryModule } from '../evaluation-history/evaluation-history.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ManagerTrendsService } from './manager-trends.service';

@Module({
  imports: [EvaluationHistoryModule, ClaudeModule, TelegramModule],
  providers: [ManagerTrendsService],
})
export class ManagerTrendsModule {}
