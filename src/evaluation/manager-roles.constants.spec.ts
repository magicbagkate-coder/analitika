import { getCanonicalManagerName, getManagerRole } from './manager-roles.constants';

describe('getCanonicalManagerName', () => {
  it('resolves a known short-name alias to the full canonical name', () => {
    expect(getCanonicalManagerName('Ольга')).toBe('Ольга Шульц');
  });

  it('passes through an unaliased name unchanged', () => {
    expect(getCanonicalManagerName('Ілона Бабанова')).toBe('Ілона Бабанова');
  });

  it('passes through an unknown/misspelled name unchanged rather than throwing', () => {
    expect(getCanonicalManagerName('Хтось Незнайомий')).toBe('Хтось Незнайомий');
  });
});

describe('getManagerRole', () => {
  it('finds a role by full canonical name', () => {
    expect(getManagerRole('Ольга Шульц')).toBe('керівник зміни');
  });

  it('resolves an alias before looking up the role', () => {
    expect(getManagerRole('Ольга')).toBe('керівник зміни');
  });

  it('returns undefined for a name not on the roster', () => {
    expect(getManagerRole('Хтось Незнайомий')).toBeUndefined();
  });
});
