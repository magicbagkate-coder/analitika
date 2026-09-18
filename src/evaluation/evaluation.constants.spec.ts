import {
  SCORE_TAG_PREFIX,
  buildLastEvaluatedMessageTag,
  filterToRecentWindow,
  hasScoreTag,
  needsEvaluation,
  withoutTrackingTags,
} from './evaluation.constants';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

describe('hasScoreTag', () => {
  it('is true when a score tag is present', () => {
    expect(hasScoreTag(['оценка-4', 'msg-123'])).toBe(true);
  });

  it('is false with no score tag', () => {
    expect(hasScoreTag(['msg-123'])).toBe(false);
  });
});

describe('withoutTrackingTags', () => {
  it('strips both score and last-evaluated-message tags, keeps everything else', () => {
    expect(withoutTrackingTags(['оценка-3', 'msg-abc', 'важливий'])).toEqual(['важливий']);
  });
});

describe('needsEvaluation', () => {
  it('needs evaluation when there is no score tag at all', () => {
    expect(needsEvaluation([], 'msg1')).toBe(true);
  });

  it('does not need evaluation when scored and no newer message exists', () => {
    const tags = ['оценка-4', buildLastEvaluatedMessageTag('msg1')];
    expect(needsEvaluation(tags, 'msg1')).toBe(false);
  });

  it('needs re-evaluation when the newest message differs from the last-scored one', () => {
    const tags = ['оценка-4', buildLastEvaluatedMessageTag('msg1')];
    expect(needsEvaluation(tags, 'msg2')).toBe(true);
  });

  it('does not need evaluation when already scored and there is no latest message id to compare', () => {
    const tags = ['оценка-4', buildLastEvaluatedMessageTag('msg1')];
    expect(needsEvaluation(tags, undefined)).toBe(false);
  });
});

describe('filterToRecentWindow', () => {
  function messageAt(id: string, hoursAgo: number): ChatMessage {
    return {
      id,
      sentBy: 'client',
      text: 'hi',
      createdAt: new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString(),
      isViewedByUser: true,
    };
  }

  it('keeps only messages inside the window', () => {
    const messages = [messageAt('recent', 1), messageAt('old', 100)];
    expect(filterToRecentWindow(messages, 72).map((m) => m.id)).toEqual(['recent']);
  });

  it('falls back to just the newest message when the whole window is empty', () => {
    const messages = [messageAt('old1', 200), messageAt('old2', 300)];
    expect(filterToRecentWindow(messages, 72).map((m) => m.id)).toEqual(['old1']);
  });

  it(`prefixes tags with "${SCORE_TAG_PREFIX}"`, () => {
    expect(buildLastEvaluatedMessageTag('xyz')).toBe('msg-xyz');
  });
});
