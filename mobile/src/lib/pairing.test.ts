import { pairingError, validateInvite } from './pairing';

describe('pairing input and errors', () => {
  it('accepts complete invitation codes with surrounding whitespace only', () => {
    expect(validateInvite(` ${'a'.repeat(48)}\n`)).toBeNull();
    for (const token of ['', 'a'.repeat(47), 'g'.repeat(48), 'a'.repeat(49)]) expect(validateInvite(token)).not.toBeNull();
  });
  it('translates Supabase plain object errors into actionable messages', () => {
    expect(pairingError({ message: 'Invitation is invalid, expired, or already used' })).toContain('重新產生');
    expect(pairingError({ message: 'User already belongs to a couple' })).toContain('另一組');
    expect(pairingError({ message: 'Couple already has two members' })).toContain('兩名');
    expect(pairingError({ message: 'Authentication required' })).toContain('重新登入');
    expect(pairingError({ message: 'Failed to fetch' })).toContain('網路');
    expect(pairingError(null)).toContain('重試');
  });
});
