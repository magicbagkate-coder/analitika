import { Module } from '@nestjs/common';
import { ClaudeSuccessService } from './claude-success.service';
import { ClaudeSynthesisService } from './claude-synthesis.service';
import { ClaudeTrendsService } from './claude-trends.service';
import { ClaudeService } from './claude.service';

@Module({
  providers: [ClaudeService, ClaudeSynthesisService, ClaudeSuccessService, ClaudeTrendsService],
  exports: [ClaudeService, ClaudeSynthesisService, ClaudeSuccessService, ClaudeTrendsService],
})
export class ClaudeModule {}
