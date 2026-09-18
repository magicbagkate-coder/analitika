import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { EvaluationSource } from './evaluation-history.types';

/** One recorded evaluation (either status) — the raw material for weekly manager trends. */
@Entity('evaluation_history')
export class EvaluationHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  chatId!: string;

  @Column()
  clientName!: string;

  @Column('text', { array: true })
  managerNames!: string[];

  @Column('int')
  score!: number;

  @Column({ type: 'varchar', length: 32 })
  source!: EvaluationSource;

  /** mistakes text for 'product_selection', successFactors text for 'order_created'. */
  @Column('text')
  note!: string;

  /** Median minutes the client waited per manager reply this chat, open-hours only — null if unmeasurable (see response-time.ts). */
  @Column({ type: 'int', nullable: true })
  medianResponseMinutes!: number | null;

  @CreateDateColumn()
  recordedAt!: Date;
}
