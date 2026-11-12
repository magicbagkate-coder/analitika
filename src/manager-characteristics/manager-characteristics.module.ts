import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module';
import { EvaluationHistoryModule } from '../evaluation-history/evaluation-history.module';
import { ReportTextsModule } from '../report-texts/report-texts.module';
import { TelegramModule } from '../telegram/telegram.module';
import { CharacteristicTextsService } from './characteristic-texts.service';
import { ManagerCharacteristicsService } from './manager-characteristics.service';

@Module({
  imports: [EvaluationHistoryModule, ClaudeModule, TelegramModule, ReportTextsModule],
  providers: [ManagerCharacteristicsService, CharacteristicTextsService],
  exports: [ManagerCharacteristicsService, CharacteristicTextsService],
})
export class ManagerCharacteristicsModule {}
