import { characterCount, daysUntil, isValidIsoDate, parseLocalDateTime, validateEmail, validateSignup, validateText } from './validation';

describe('account entry rules', () => {
  it('accepts a valid email address and rejects malformed input', () => {
    expect(validateEmail(' person@example.com ')).toBeNull();
    expect(validateEmail('not-an-email')).toMatch('Email');
  });

  it('requires consent, adult confirmation, and a completed test notice', () => {
    expect(validateSignup(false, true, 'ap-southeast-1', '30 days after study')).toMatch('同意');
    expect(validateSignup(true, false, 'ap-southeast-1', '30 days after study')).toMatch('18');
    expect(validateSignup(true, true, '', '30 days after study')).toMatch('尚未設定');
    expect(validateSignup(true, true, 'ap-southeast-1', '30 days after study')).toBeNull();
  });
});

describe('shared text limits', () => {
  it('counts Unicode code points consistently with PostgreSQL char_length', () => {
    expect(characterCount('我們一起😊')).toBe(5);
  });

  it('rejects whitespace and text over the configured limit', () => {
    expect(validateText('   ', 500)).toMatch('輸入');
    expect(validateText('a'.repeat(501), 500)).toMatch('500');
    expect(validateText('a'.repeat(500), 500)).toBeNull();
  });
});

describe('date input and countdown', () => {
  it('accepts valid calendar dates and rejects impossible dates', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2025-02-29')).toBe(false);
  });

  it('parses only valid local event date-times', () => {
    expect(parseLocalDateTime('2026-11-12 18:30')).not.toBeNull();
    expect(parseLocalDateTime('2026-02-30 18:30')).toBeNull();
    expect(parseLocalDateTime('tomorrow')).toBeNull();
  });

  it('counts down to the next annual occurrence', () => {
    expect(daysUntil('2020-11-12', true, new Date(2026, 10, 10, 12))).toBe(2);
    expect(daysUntil('2026-11-08', false, new Date(2026, 10, 10, 12))).toBe(0);
  });
});
