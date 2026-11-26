import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TouchAttemptEntity } from './touch-attempt.entity';
import { TouchCorrectionEntity } from './touch-correction.entity';
import { TouchLogService } from './touch-log.service';

@Module({
  imports: [TypeOrmModule.forFeature([TouchAttemptEntity, TouchCorrectionEntity])],
  providers: [TouchLogService],
  exports: [TouchLogService],
})
export class TouchLogModule {}
