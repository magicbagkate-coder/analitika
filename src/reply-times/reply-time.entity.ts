import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { EvaluationSource } from '../evaluation-history/evaluation-history.types';

/**
 * One manager reply to a waiting client message. evaluation_history keeps only a per-chat median,
 * which can't say whose speed it was — this table is what per-manager / per-shift / per-day speed
 * is queried from.
 */
@Entity('reply_times')
export class ReplyTimeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  chatId!: string;

  /** Sitniks id of the manager's reply — unique, so re-reading the same 72h window on the next run never duplicates a row. */
  @Column({ unique: true })
  messageId!: string;

  /** Canonical roster name (see manager-roles.constants.ts), so one person is never split across aliases. */
  @Column()
  managerName!: string;

  @Column({ type: 'varchar', length: 32 })
  source!: EvaluationSource;

  @Column({ type: 'timestamp' })
  clientMessageAt!: Date;

  @Column({ type: 'timestamp' })
  repliedAt!: Date;

  /** Open-hours minutes the client waited (00:00-08:00 Kyiv excluded), fractional. */
  @Column({ type: 'float' })
  minutes!: number;

  @CreateDateColumn()
  recordedAt!: Date;
}
