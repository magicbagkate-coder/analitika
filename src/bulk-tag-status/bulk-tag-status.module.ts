import { Module } from '@nestjs/common';
import { SitniksChatListModule } from '../sitniks-chat-list/sitniks-chat-list.module';
import { SitniksChatUpdateModule } from '../sitniks-chat-update/sitniks-chat-update.module';
import { BulkTagStatusService } from './bulk-tag-status.service';

// Временный модуль для одноразовой задачи — можно удалить после того, как reports/bulk-tag-log.txt подтвердит результат.
@Module({
  imports: [SitniksChatListModule, SitniksChatUpdateModule],
  providers: [BulkTagStatusService],
})
export class BulkTagStatusModule {}
