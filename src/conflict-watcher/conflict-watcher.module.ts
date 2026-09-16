import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module';
import { ReportRunStatusModule } from '../report-run-status/report-run-status.module';
import { SitniksChatListModule } from '../sitniks-chat-list/sitniks-chat-list.module';
import { SitniksChatMessagesModule } from '../sitniks-chat-messages/sitniks-chat-messages.module';
import { SitniksChatUpdateModule } from '../sitniks-chat-update/sitniks-chat-update.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ConflictWatcherService } from './conflict-watcher.service';

@Module({
  imports: [SitniksChatListModule, SitniksChatMessagesModule, SitniksChatUpdateModule, ClaudeModule, TelegramModule, ReportRunStatusModule],
  providers: [ConflictWatcherService],
})
export class ConflictWatcherModule {}
