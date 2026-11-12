import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { ReportTextKind } from './report-texts.types';

/** One text block of a report (a manager's characteristic or a shift's problems), kept for the spreadsheet. */
@Entity('report_texts')
export class ReportTextEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Nominal time of the report that produced the text (15:45 or 23:45 Kyiv, as a UTC instant). */
  @Column({ type: 'timestamp' })
  reportAt!: Date;

  @Column({ type: 'varchar', length: 16 })
  kind!: ReportTextKind;

  /** Canonical manager name for 'manager' texts, the shift key (see shift-roster.constants) for 'shift' texts. */
  @Column()
  subject!: string;

  @Column('text')
  text!: string;

  @CreateDateColumn()
  recordedAt!: Date;
}
