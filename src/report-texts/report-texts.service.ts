import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportTextEntity } from './report-text.entity';
import type { ReportTextRow } from './report-texts.types';

/** Stores the text blocks of each report so the spreadsheet can show them next to the numbers. */
@Injectable()
export class ReportTextsService {
  private readonly logger = new Logger(ReportTextsService.name);

  constructor(
    @InjectRepository(ReportTextEntity)
    private readonly repository: Repository<ReportTextEntity>,
  ) {}

  /** A database hiccup must not break the report that was already sent, so it only logs. */
  async tryRecordMany(rows: ReportTextRow[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await this.repository.insert(rows);
    } catch (error) {
      this.logger.warn(`Could not record ${rows.length} report texts: ${(error as Error).message}`);
    }
  }

  async findAll(): Promise<ReportTextEntity[]> {
    return this.repository.find({ order: { reportAt: 'ASC' } });
  }
}
