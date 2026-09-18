import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { LogLevel } from './logs.types';

/** One log line ever emitted by the app, mirrored from the console — see PersistentLogger. */
@Entity('log_entries')
export class LogEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  level!: LogLevel;

  /** The class name NestJS's Logger was constructed with (e.g. "StatusReportService"), if any. */
  @Column({ type: 'varchar', nullable: true })
  context!: string | null;

  @Column('text')
  message!: string;

  /** Stack trace, only ever present on an `error` call. */
  @Column({ type: 'text', nullable: true })
  trace!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
