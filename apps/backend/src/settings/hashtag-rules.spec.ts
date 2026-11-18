import {
  applyHashtagRules,
  formatHashtag,
  hashtagRuleError,
  DEFAULT_HASHTAG_RULES,
  type HashtagRule,
} from './hashtag-rules';

const rule = (r: Partial<HashtagRule>): HashtagRule => ({
  id: Math.random().toString(36),
  type: 'forbid',
  enabled: true,
  value: '',
  ...r,
});

describe('formatHashtag', () => {
  it('adds #, joins words with _, strips punctuation', () => {
    expect(formatHashtag('русская литература')).toBe('#русская_литература');
    expect(formatHashtag('##классика!')).toBe('#классика');
  });
  it('rejects empty and too long tags', () => {
    expect(formatHashtag('#!!')).toBeNull();
    expect(formatHashtag('а'.repeat(30))).toBeNull();
    expect(formatHashtag('а'.repeat(29))).toHaveLength(30);
  });
});

describe('applyHashtagRules', () => {
  it('default rules drop the old forbidden fragments', () => {
    expect(
      applyHashtagRules(['#классика', '#политика', '#Великая_Война', '#проза'], DEFAULT_HASHTAG_RULES),
    ).toEqual(['#классика', '#проза']);
  });

  it('forbid ignores case and ё/е', () => {
    const rules = [rule({ value: 'ЕЛКА' })];
    expect(applyHashtagRules(['#ёлка', '#зима'], rules)).toEqual(['#зима']);
  });

  it('replaces whole tags only, then dedupes', () => {
    const rules = [rule({ type: 'replace', value: '#советская_литература', replacement: 'ссср' })];
    expect(
      applyHashtagRules(['#Советская_литература', '#ссср', '#советская_литература_xx'], rules),
    ).toEqual(['#ссср', '#советская_литература_xx']);
  });

  it('forbid applies to replacement results', () => {
    const rules = [
      rule({ type: 'replace', value: 'фантастика', replacement: 'военная_фантастика' }),
      rule({ value: 'воен' }),
    ];
    expect(applyHashtagRules(['#фантастика'], rules)).toEqual([]);
  });

  it('puts mandatory tags first, respecting the year range', () => {
    const rules = [
      rule({ type: 'add', value: 'букинистика' }),
      rule({ type: 'add', value: 'советская_книга', yearTo: 1991 }),
      rule({ type: 'add', value: 'новинка', yearFrom: 2020 }),
    ];
    expect(applyHashtagRules(['#проза', '#букинистика'], rules, { yearPublished: 1975 })).toEqual([
      '#букинистика',
      '#советская_книга',
      '#проза',
    ]);
    // no year → only unconditional tags
    expect(applyHashtagRules([], rules)).toEqual(['#букинистика']);
  });

  it('skips disabled rules and caps at 30 tags', () => {
    const rules = [rule({ value: 'тег', enabled: false })];
    const many = Array.from({ length: 40 }, (_, i) => `#тег${i}`);
    expect(applyHashtagRules(many, rules)).toHaveLength(30);
  });

  it('handles null tags', () => {
    expect(applyHashtagRules(null, [])).toEqual([]);
  });
});

describe('hashtagRuleError', () => {
  it('validates each rule type', () => {
    expect(hashtagRuleError(rule({ value: 'а' }))).toMatch(/2 буквы/);
    expect(hashtagRuleError(rule({ value: 'полити' }))).toBeNull();
    expect(hashtagRuleError(rule({ type: 'replace', value: 'а', replacement: '' }))).toMatch(/замена/);
    expect(hashtagRuleError(rule({ type: 'replace', value: '#А', replacement: 'а' }))).toMatch(/сам на себя/);
    expect(hashtagRuleError(rule({ type: 'add', value: 'x', yearFrom: 2000, yearTo: 1990 }))).toMatch(/год/);
    expect(hashtagRuleError(rule({ type: 'add', value: 'букинистика', yearTo: 1991 }))).toBeNull();
  });
});
