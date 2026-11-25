import { Module } from '@nestjs/common';
import { SitniksClientModule } from '../sitniks-client/sitniks-client.module';
import { SitniksChatStatusService } from './sitniks-chat-status.service';

@Module({
  imports: [SitniksClientModule],
  providers: [SitniksChatStatusService],
  exports: [SitniksChatStatusService],
})
export class SitniksChatStatusModule {}
