import { ClaudeService } from './claude.service';
import type { ChatEvaluationResult } from '../evaluation/evaluation.types';

const evaluation: ChatEvaluationResult = {
  score: 3,
  purchased: null,
  goodPoints: 'ok',
  closingSummary: 'ok',
  mistakes: 'Дарія Братко, 09:25: не назвала цену.',
  recommendation: 'ok',
  clientConflict: false,
};

describe('ClaudeService.evaluateChat verification of low scores', () => {
  let service: ClaudeService;
  let verifier: { verifyMistakes: jest.Mock };
  let requestEvaluation: jest.SpyInstance;

  function evaluateWith(result: ChatEvaluationResult): Promise<ChatEvaluationResult> {
    requestEvaluation.mockResolvedValue(result);
    return service.evaluateChat([], 'client');
  }

  beforeEach(() => {
    verifier = { verifyMistakes: jest.fn() };
    const appConfig = { getAnthropicApiKey: () => 'test-key', getAnthropicModel: () => 'model' };
    service = new ClaudeService(appConfig as never, verifier as never);
    requestEvaluation = jest.spyOn(service as never, 'requestEvaluation');
  });

  it('does not verify a score above 3', async () => {
    const result = await evaluateWith({ ...evaluation, score: 4 });

    expect(verifier.verifyMistakes).not.toHaveBeenCalled();
    expect(result.score).toBe(4);
  });

  it('caps a score at 4 when mistakes are present', async () => {
    const result = await evaluateWith({ ...evaluation, score: 5 });

    expect(result.score).toBe(4);
  });

  it('does not verify when there are already no mistakes, and gives 5', async () => {
    const result = await evaluateWith({ ...evaluation, mistakes: 'Явных ошибок нет.' });

    expect(verifier.verifyMistakes).not.toHaveBeenCalled();
    expect(result.score).toBe(5);
  });

  it('gives "no mistakes" and 5 when no claim survives', async () => {
    verifier.verifyMistakes.mockResolvedValue({ confirmedClaims: [] });

    const result = await evaluateWith(evaluation);

    expect(result.mistakes).toBe('Явных ошибок нет.');
    expect(result.score).toBe(5);
  });

  it('keeps only the confirmed claims and the score when some survive', async () => {
    verifier.verifyMistakes.mockResolvedValue({ confirmedClaims: ['Ганна Кірієнко, 17:35: ответила через 2 часа.'] });

    const result = await evaluateWith(evaluation);

    expect(result.mistakes).toBe('Ганна Кірієнко, 17:35: ответила через 2 часа.');
    expect(result.score).toBe(3);
  });

  it('keeps the original evaluation when the verifier fails', async () => {
    verifier.verifyMistakes.mockRejectedValue(new Error('timeout'));

    const result = await evaluateWith(evaluation);

    expect(result).toEqual(evaluation);
  });
});
