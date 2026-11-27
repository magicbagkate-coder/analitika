import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module';
import { ReportRunStatusModule } from '../report-run-status/report-run-status.module';
import { SitniksChatListModule } from '../sitniks-chat-list/sitniks-chat-list.module';
import { SitniksChatModule } from '../sitniks-chat/sitniks-chat.module';
import { SitniksChatMessagesModule } from '../sitniks-chat-messages/sitniks-chat-messages.module';
import { SitniksChatSendModule } from '../sitniks-chat-send/sitniks-chat-send.module';
import { SitniksChatStatusModule } from '../sitniks-chat-status/sitniks-chat-status.module';
import { SitniksChatUpdateModule } from '../sitniks-chat-update/sitniks-chat-update.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TouchLogModule } from '../touch-log/touch-log.module';
import { TouchVideoLibraryModule } from '../touch-video-library/touch-video-library.module';
import { TouchApprovalService } from './touch-approval.service';
import { TouchChatService } from './touch-chat.service';
import { TouchForceService } from './touch-force.service';
import { TouchMorningService } from './touch-morning.service';
import { TouchPlannerService } from './touch-planner.service';
import { TouchSchedulerService } from './touch-scheduler.service';
import { TouchSenderService } from './touch-sender.service';
import { TouchTaggerService } from './touch-tagger.service';
import { TouchTickService } from './touch-tick.service';

/** The touch bot (owner, 2026-11-20/25): switched on only by TOUCH_MODE, see TouchSchedulerService. */
@Module({
  imports: [
    ClaudeModule,
    ReportRunStatusModule,
    SitniksChatListModule,
    SitniksChatModule,
    SitniksChatMessagesModule,
    SitniksChatSendModule,
    SitniksChatStatusModule,
    SitniksChatUpdateModule,
    TelegramModule,
    TouchLogModule,
    TouchVideoLibraryModule,
  ],
  providers: [TouchPlannerService, TouchSenderService, TouchTaggerService, TouchApprovalService, TouchChatService, TouchForceService, TouchTickService, TouchMorningService, TouchSchedulerService],
})
export class TouchModule {}
