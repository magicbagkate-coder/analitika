import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { TouchState } from './touch-log.types';

/**
 * One touch of one chat, keyed by the manager message it follows ("anchor"). It holds what the bot
 * watches (when it first saw the client read the anchor) and what it did (the texts, the video, the
 * outcome). It is also the only proof that a touch was made, so a chat is never touched twice.
 */
@Entity('touch_attempts')
@Unique('UQ_touch_attempts_chat_anchor', ['chatId', 'anchorMessageId'])
export class TouchAttemptEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  chatId!: string;

  @Column()
  anchorMessageId!: string;

  /** Kept so a message to the owner can name the client without asking Sitniks again. */
  @Column()
  clientName!: string;

  /** The Sitniks status the chat was in — the real status counts toward the owner's first-30 approvals. */
  @Column()
  sourceStatus!: string;

  @Column({ type: 'varchar', length: 24 })
  state!: TouchState;

  /** The first time the bot saw the client having read the anchor; Sitniks gives no read time itself. */
  @Column({ type: 'timestamp', nullable: true })
  readSeenAt!: Date | null;

  @Column({ type: 'varchar', nullable: true })
  article!: string | null;

  @Column({ type: 'varchar', nullable: true })
  videoFileId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  videoFileName!: string | null;

  @Column({ type: 'text', nullable: true })
  descriptionText!: string | null;

  @Column({ type: 'text', nullable: true })
  questionText!: string | null;

  /** Telegram message id of the approval request sent to the owner. */
  @Column({ type: 'int', nullable: true })
  approvalMessageId!: number | null;

  /** When the owner was told that the article or the video is missing — said once per anchor. */
  @Column({ type: 'timestamp', nullable: true })
  missingAlertedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  touchedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
