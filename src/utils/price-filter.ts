// Checkbox pair <-> price filter mapping for the Discover price
// dropdown. Pure functions, no React, so they are node-testable.
//
// The pair is the state: neither checked = all, Free only = free, Paid
// only = paid, both checked = all. The canonical pair for 'all' is
// neither checked (no restriction), which is what Reset all filters
// and a shared URL resolve to.

export type PriceType = 'all' | 'free' | 'paid';

export interface PricePair {
  free: boolean;
  paid: boolean;
}

export function pairFor(priceType: PriceType): PricePair {
  if (priceType === 'free') return { free: true, paid: false };
  if (priceType === 'paid') return { free: false, paid: true };
  return { free: false, paid: false };
}

export function priceTypeFor(pair: PricePair): PriceType {
  if (pair.free && !pair.paid) return 'free';
  if (pair.paid && !pair.free) return 'paid';
  return 'all';
}
