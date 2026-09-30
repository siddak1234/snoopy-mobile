import type { PlanPrice } from '@/lib/platform/billing';

/**
 * How many minor units make one major unit, for the currencies a price is shown
 * in — ported from `snoopy/lib/plan-price.ts`. The platform publishes a plan's
 * price in the provider's MINOR units (backend ADR-0031), and `Intl` cannot be
 * trusted to supply the divisor, so it is stated here; any other currency is
 * not formatted, and the screen says the price is shown at checkout.
 */
const MINOR_UNIT_EXPONENT: Readonly<Record<string, number>> = {
  usd: 2,
  eur: 2,
  gbp: 2,
  cad: 2,
  aud: 2,
  nzd: 2,
  chf: 2,
  sek: 2,
  nok: 2,
  dkk: 2,
  sgd: 2,
  hkd: 2,
  jpy: 0,
  krw: 0,
};

/** A plan's price as a person reads it, or `undefined` when it cannot be stated without guessing. */
export function formatPlanPrice(price: PlanPrice): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(MINOR_UNIT_EXPONENT, price.currency)) return undefined;
  const exponent = MINOR_UNIT_EXPONENT[price.currency];
  if (exponent === undefined || !Number.isSafeInteger(price.amount)) return undefined;
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(price.amount / 10 ** exponent);
  return price.interval ? `${amount} per ${price.interval}` : amount;
}
