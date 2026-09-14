import { Module } from '@nestjs/common';
import { SitniksClientModule } from '../sitniks-client/sitniks-client.module';
import { SitniksChatUpdateService } from './sitniks-chat-update.service';

@Module({
  imports: [SitniksClientModule],
  providers: [SitniksChatUpdateService],
  exports: [SitniksChatUpdateService],
})
export class SitniksChatUpdateModule {}
