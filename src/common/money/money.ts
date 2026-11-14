const AMOUNT = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

export function toCents(amount: string): bigint {
  const match = AMOUNT.exec(amount);

  if (!match) {
    throw new Error(`Invalid amount: "${amount}"`);
  }

  const [, sign, whole, fraction = ''] = match;
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));

  return sign ? -cents : cents;
}

export function fromCents(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const fraction = (abs % 100n).toString().padStart(2, '0');

  return `${sign}${abs / 100n}.${fraction}`;
}
