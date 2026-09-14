import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { SitniksChatListModule } from '../sitniks-chat-list/sitniks-chat-list.module';
import { SitniksChatMessagesModule } from '../sitniks-chat-messages/sitniks-chat-messages.module';
import { TelegramModule } from '../telegram/telegram.module';
import { StatusReportService } from './status-report.service';

@Module({
  imports: [SitniksChatListModule, SitniksChatMessagesModule, EvaluationModule, ClaudeModule, TelegramModule],
  providers: [StatusReportService],
})
export class StatusReportModule {}
