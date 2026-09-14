import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module';
import { SitniksChatNotesModule } from '../sitniks-chat-notes/sitniks-chat-notes.module';
import { SitniksChatUpdateModule } from '../sitniks-chat-update/sitniks-chat-update.module';
import { EvaluationService } from './evaluation.service';

@Module({
  imports: [ClaudeModule, SitniksChatNotesModule, SitniksChatUpdateModule],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
