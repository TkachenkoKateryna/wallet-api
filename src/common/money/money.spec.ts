import { fromCents, toCents } from './money.js';

describe('money', () => {
  it('adds without floating-point error', () => {
    expect(fromCents(toCents('0.10') + toCents('0.20'))).toBe('0.30');
  });

  it.each([
    ['125.50', 12550n],
    ['125.5', 12550n],
    ['125', 12500n],
    ['0.05', 5n],
    ['-0.50', -50n],
    ['-125.00', -12500n],
    ['99999999999999999.99', 9999999999999999999n],
  ])('converts %s to %s cents', (amount, cents) => {
    expect(toCents(amount)).toBe(cents);
  });

  it.each([
    [12550n, '125.50'],
    [5n, '0.05'],
    [-50n, '-0.50'],
    [-12500n, '-125.00'],
    [0n, '0.00'],
    [-0n, '0.00'],
    [9999999999999999999n, '99999999999999999.99'],
  ])('formats %s cents as %s', (cents, amount) => {
    expect(fromCents(cents)).toBe(amount);
  });

  it.each(['1.234', '1.', '.5', '+1', '1e3', '', ' 1', '1,00', '--1', 'abc'])(
    'rejects %j',
    (amount) => {
      expect(() => toCents(amount)).toThrow('Invalid amount');
    },
  );
});
