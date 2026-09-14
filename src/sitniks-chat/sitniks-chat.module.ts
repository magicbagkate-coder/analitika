import { Module } from '@nestjs/common';
import { SitniksClientModule } from '../sitniks-client/sitniks-client.module';
import { SitniksChatService } from './sitniks-chat.service';

@Module({
  imports: [SitniksClientModule],
  providers: [SitniksChatService],
  exports: [SitniksChatService],
})
export class SitniksChatModule {}
