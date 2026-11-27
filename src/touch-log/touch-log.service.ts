import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TouchAttemptEntity } from './touch-attempt.entity';
import { TouchCorrectionEntity } from './touch-correction.entity';
import type { CorrectionExample, NewTouchAttempt, TouchPlan, TouchState } from './touch-log.types';

const TOUCH_MADE_STATES: TouchState[] = ['sent', 'uncertain'];

/** Reads and writes the touch journal. Every method is one plain query — the decisions live elsewhere. */
@Injectable()
export class TouchLogService {
  constructor(
    @InjectRepository(TouchAttemptEntity)
    private readonly repository: Repository<TouchAttemptEntity>,
    @InjectRepository(TouchCorrectionEntity)
    private readonly corrections: Repository<TouchCorrectionEntity>,
  ) {}

  async findForAnchor(params: { chatId: string; anchorMessageId: string }): Promise<TouchAttemptEntity | null> {
    return this.repository.findOne({ where: params });
  }

  async findById(id: string): Promise<TouchAttemptEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  /** The newest touch that really went out (or may have) in this chat. */
  async findLatestMadeTouch(chatId: string): Promise<TouchAttemptEntity | null> {
    return this.repository.findOne({ where: { chatId, state: In(TOUCH_MADE_STATES) }, order: { touchedAt: 'DESC' } });
  }

  async createWatching(attempt: NewTouchAttempt): Promise<TouchAttemptEntity> {
    return this.repository.save(this.repository.create({ ...attempt, state: 'watching' }));
  }

  async markReadSeen(params: { id: string; readSeenAt: Date }): Promise<void> {
    await this.repository.update(params.id, { readSeenAt: params.readSeenAt });
  }

  async markMissingAlerted(params: { id: string; key: string }): Promise<void> {
    await this.repository.update(params.id, { missingAlertedAt: new Date(), missingAlertedKey: params.key });
  }

  async savePlan(params: { id: string; plan: TouchPlan }): Promise<void> {
    const { article, videos, messageText } = params.plan;
    await this.repository.update(params.id, { article, videos, messageText });
  }

  async markPendingApproval(params: { id: string; approvalMessageId: number }): Promise<void> {
    await this.repository.update(params.id, { state: 'pending_approval', approvalMessageId: params.approvalMessageId });
  }

  /**
   * Moves a row from one state to another only if it is still in the expected one, so two ticks or a double
   * tap on the approval button can never both start the same send. Returns whether this call won.
   */
  async claimState(params: { id: string; from: TouchState[]; to: TouchState }): Promise<boolean> {
    const result = await this.repository.update({ id: params.id, state: In(params.from) }, { state: params.to });
    return (result.affected ?? 0) > 0;
  }

  /** The dialog itself said no touch: the chat is left alone for this message and the reason is kept for the owner. */
  async markSkippedByMeaning(params: { id: string; reason: string }): Promise<void> {
    await this.repository.update(params.id, { state: 'skipped', skipReason: params.reason });
  }

  /** The owner's own text for a touch that still waits for her; false when it is no longer waiting. */
  async updatePendingMessage(params: { id: string; messageText: string }): Promise<boolean> {
    const result = await this.repository.update({ id: params.id, state: 'pending_approval' }, { messageText: params.messageText });
    return (result.affected ?? 0) > 0;
  }

  async recordCorrection(params: { chatId: string; originalText: string; correctedText: string }): Promise<void> {
    await this.corrections.insert(params);
  }

  /** The newest corrections first — what the writer learns the owner's wording from. */
  async findRecentCorrections(limit: number): Promise<CorrectionExample[]> {
    const rows = await this.corrections.find({ order: { createdAt: 'DESC' }, take: limit });
    return rows.map((row) => ({ original: row.originalText, corrected: row.correctedText }));
  }

  /** The messages of the newest touches that went out — the writer must not repeat their wording. */
  async findRecentTouchTexts(limit: number): Promise<string[]> {
    const rows = await this.repository.find({ where: { state: In(TOUCH_MADE_STATES) }, order: { touchedAt: 'DESC' }, take: limit });
    return rows.flatMap((row) => (row.messageText ? [row.messageText] : []));
  }

  async finishSend(params: { id: string; state: TouchState }): Promise<void> {
    await this.repository.update(params.id, { state: params.state, touchedAt: new Date() });
  }

  async setState(params: { id: string; state: TouchState }): Promise<void> {
    await this.repository.update(params.id, { state: params.state });
  }

  async findPendingApprovals(): Promise<TouchAttemptEntity[]> {
    return this.repository.find({ where: { state: 'pending_approval' }, order: { createdAt: 'ASC' } });
  }

  /** Rows still waiting for the owner or for the hour — used to close them when their chat has moved on. */
  async findOpenForChat(chatId: string): Promise<TouchAttemptEntity[]> {
    return this.repository.find({ where: { chatId, state: In<TouchState>(['watching', 'pending_approval']) } });
  }
}
