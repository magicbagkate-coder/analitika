import { Module } from '@nestjs/common';
import { SitniksClientModule } from '../sitniks-client/sitniks-client.module';
import { SitniksChatSendService } from './sitniks-chat-send.service';

@Module({
  imports: [SitniksClientModule],
  providers: [SitniksChatSendService],
  exports: [SitniksChatSendService],
})
export class SitniksChatSendModule {}
