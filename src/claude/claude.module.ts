import { Module } from '@nestjs/common';
import { ClaudeSuccessService } from './claude-success.service';
import { ClaudeSynthesisService } from './claude-synthesis.service';
import { ClaudeService } from './claude.service';

@Module({
  providers: [ClaudeService, ClaudeSynthesisService, ClaudeSuccessService],
  exports: [ClaudeService, ClaudeSynthesisService, ClaudeSuccessService],
})
export class ClaudeModule {}
