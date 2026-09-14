import { Module } from '@nestjs/common';
import { DailyStatsStoreModule } from '../daily-stats-store/daily-stats-store.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { SitniksChatListModule } from '../sitniks-chat-list/sitniks-chat-list.module';
import { SitniksChatMessagesModule } from '../sitniks-chat-messages/sitniks-chat-messages.module';
import { SitniksClientModule } from '../sitniks-client/sitniks-client.module';
import { SitniksManagersModule } from '../sitniks-managers/sitniks-managers.module';
import { SitniksChatPollerService } from './sitniks-chat-poller.service';

@Module({
  imports: [
    SitniksChatListModule,
    SitniksChatMessagesModule,
    SitniksManagersModule,
    EvaluationModule,
    DailyStatsStoreModule,
    SitniksClientModule,
  ],
  providers: [SitniksChatPollerService],
})
export class SitniksChatPollerModule {}
