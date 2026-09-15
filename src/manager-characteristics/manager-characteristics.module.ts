import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module';
import { EvaluationHistoryModule } from '../evaluation-history/evaluation-history.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ManagerCharacteristicsService } from './manager-characteristics.service';

@Module({
  imports: [EvaluationHistoryModule, ClaudeModule, TelegramModule],
  providers: [ManagerCharacteristicsService],
  exports: [ManagerCharacteristicsService],
})
export class ManagerCharacteristicsModule {}
