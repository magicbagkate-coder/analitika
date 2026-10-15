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
    expect(getManagerRole('Бурнацева Ольга')).toBe('керівник зміни');
  });

  it('resolves an alias before looking up the role', () => {
    expect(getManagerRole('Віолетта')).toBe('старший менеджер');
  });

  it('returns undefined for a manager who has left', () => {
    expect(getManagerRole('Карина Ковальчук')).toBeUndefined();
  });

  it('returns undefined for a name not on the roster', () => {
    expect(getManagerRole('Хтось Незнайомий')).toBeUndefined();
  });
});
