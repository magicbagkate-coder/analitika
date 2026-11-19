import { Module } from '@nestjs/common';
import { ClaudeManagerSummaryService } from './claude-manager-summary.service';
import { ClaudeMistakesVerifierService } from './claude-mistakes-verifier.service';
import { ClaudeShiftProblemsService } from './claude-shift-problems.service';
import { ClaudeSuccessService } from './claude-success.service';
import { ClaudeSynthesisService } from './claude-synthesis.service';
import { ClaudeTrashStoriesService } from './claude-trash-stories.service';
import { ClaudeTrendsService } from './claude-trends.service';
import { ClaudeService } from './claude.service';

@Module({
  providers: [ClaudeService, ClaudeMistakesVerifierService, ClaudeSynthesisService, ClaudeSuccessService, ClaudeTrendsService, ClaudeManagerSummaryService, ClaudeShiftProblemsService, ClaudeTrashStoriesService],
  exports: [ClaudeService, ClaudeSynthesisService, ClaudeSuccessService, ClaudeTrendsService, ClaudeManagerSummaryService, ClaudeShiftProblemsService, ClaudeTrashStoriesService],
})
export class ClaudeModule {}
