import { ClaudeMistakesVerifierService } from './claude-mistakes-verifier.service';

describe('ClaudeMistakesVerifierService.extractVerified', () => {
  const appConfig = { getAnthropicApiKey: () => 'test-key', getAnthropicModel: () => 'model' };
  const service = new ClaudeMistakesVerifierService(appConfig as never);
  const extract = (input: unknown): { confirmedClaims: string[] } =>
    service['extractVerified']({ content: [{ type: 'tool_use', input }], stop_reason: 'tool_use' } as never, 'client');

  it('keeps only the claims decided as confirmed', () => {
    const decisions = [
      { claim: 'a', confirmed: true, reason: '09:25' },
      { claim: 'b', confirmed: false, reason: 'photo follows' },
    ];

    expect(extract({ decisions })).toEqual({ confirmedClaims: ['a'] });
  });

  it('ignores malformed decision entries', () => {
    expect(extract({ decisions: [{ claim: 'a' }, null, { claim: 'c', confirmed: true, reason: 'x' }] })).toEqual({ confirmedClaims: ['c'] });
  });

  it('throws when decisions is missing or empty instead of guessing', () => {
    expect(() => extract({})).toThrow('no decisions');
    expect(() => extract({ decisions: [] })).toThrow('no decisions');
  });
});
