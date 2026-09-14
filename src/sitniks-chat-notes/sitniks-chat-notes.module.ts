import { Module } from '@nestjs/common';
import { SitniksClientModule } from '../sitniks-client/sitniks-client.module';
import { SitniksChatNotesService } from './sitniks-chat-notes.service';

@Module({
  imports: [SitniksClientModule],
  providers: [SitniksChatNotesService],
  exports: [SitniksChatNotesService],
})
export class SitniksChatNotesModule {}
