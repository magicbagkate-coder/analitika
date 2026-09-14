import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvaluationHistoryEntity } from './evaluation-history.entity';
import { EvaluationHistoryService } from './evaluation-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([EvaluationHistoryEntity])],
  providers: [EvaluationHistoryService],
  exports: [EvaluationHistoryService],
})
export class EvaluationHistoryModule {}
