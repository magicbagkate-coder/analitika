import { needsSuccessAnalysis, replaceSuccessTags } from './order-success-analysis.constants';

describe('needsSuccessAnalysis', () => {
  it('needs analysis when there is no success tag at all — even if it has an оценка- tag from Вибір товару', () => {
    expect(needsSuccessAnalysis(['оценка-4'], 'msg1')).toBe(true);
  });

  it('does not need re-analysis once tagged and no newer message exists', () => {
    const tags = ['успіх-аналіз-v2', 'succ-msg-msg1'];
    expect(needsSuccessAnalysis(tags, 'msg1')).toBe(false);
  });

  it('needs re-analysis when a newer message arrived since the last pass', () => {
    const tags = ['успіх-аналіз-v2', 'succ-msg-msg1'];
    expect(needsSuccessAnalysis(tags, 'msg2')).toBe(true);
  });
});

describe('replaceSuccessTags', () => {
  it('replaces any prior оценка- tag with the new score and adds the success markers', () => {
    const result = replaceSuccessTags(['оценка-3', 'важливий'], 5, 'msg1');
    expect(result).toEqual(['важливий', 'оценка-5', 'успіх-аналіз-v2', 'succ-msg-msg1']);
  });

  it('replaces a prior success tag instead of duplicating it on re-analysis', () => {
    const result = replaceSuccessTags(['оценка-4', 'успіх-аналіз-v2', 'succ-msg-old'], 4, 'msgNew');
    expect(result).toEqual(['оценка-4', 'успіх-аналіз-v2', 'succ-msg-msgNew']);
  });

  it('omits the last-message tag when there is no latest message id', () => {
    const result = replaceSuccessTags([], 4, undefined);
    expect(result).toEqual(['оценка-4', 'успіх-аналіз-v2']);
  });
});
