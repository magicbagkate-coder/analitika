import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One time the owner changed the bot's touch message before sending it (2026-11-26). The newest ones go to the
 * writer as examples, so the bot learns her wording and tone.
 */
@Entity('touch_corrections')
export class TouchCorrectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  chatId!: string;

  @Column('text')
  originalText!: string;

  @Column('text')
  correctedText!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
