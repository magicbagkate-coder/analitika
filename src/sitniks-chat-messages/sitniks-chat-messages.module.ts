import { Module } from '@nestjs/common';
import { SitniksClientModule } from '../sitniks-client/sitniks-client.module';
import { SitniksChatMessagesService } from './sitniks-chat-messages.service';

@Module({
  imports: [SitniksClientModule],
  providers: [SitniksChatMessagesService],
  exports: [SitniksChatMessagesService],
})
export class SitniksChatMessagesModule {}
