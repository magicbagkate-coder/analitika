import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportTextEntity } from './report-text.entity';
import { ReportTextsService } from './report-texts.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReportTextEntity])],
  providers: [ReportTextsService],
  exports: [ReportTextsService],
})
export class ReportTextsModule {}
