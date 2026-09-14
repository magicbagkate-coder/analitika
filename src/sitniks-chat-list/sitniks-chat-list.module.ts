import { Module } from '@nestjs/common';
import { SitniksClientModule } from '../sitniks-client/sitniks-client.module';
import { SitniksChatListService } from './sitniks-chat-list.service';

@Module({
  imports: [SitniksClientModule],
  providers: [SitniksChatListService],
  exports: [SitniksChatListService],
})
export class SitniksChatListModule {}
