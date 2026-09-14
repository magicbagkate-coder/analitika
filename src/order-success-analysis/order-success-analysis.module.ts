import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module';
import { EvaluationHistoryModule } from '../evaluation-history/evaluation-history.module';
import { SitniksChatListModule } from '../sitniks-chat-list/sitniks-chat-list.module';
import { SitniksChatMessagesModule } from '../sitniks-chat-messages/sitniks-chat-messages.module';
import { SitniksChatUpdateModule } from '../sitniks-chat-update/sitniks-chat-update.module';
import { TelegramModule } from '../telegram/telegram.module';
import { OrderSuccessAnalysisService } from './order-success-analysis.service';

@Module({
  imports: [
    SitniksChatListModule,
    SitniksChatMessagesModule,
    SitniksChatUpdateModule,
    ClaudeModule,
    TelegramModule,
    EvaluationHistoryModule,
  ],
  providers: [OrderSuccessAnalysisService],
})
export class OrderSuccessAnalysisModule {}
