/** Centralized $B ↔ $M conversions and display formatting. V4 cells 11, 15. */

export const B_TO_M = 1000;
export const DOLLARS_TO_M = 1e-6;

export function billionToMillion(value_B: number): number {
  return value_B * B_TO_M;
}

export function millionToBillion(value_M: number): number {
  return value_M / B_TO_M;
}

export function dollarsToMillion(dollars: number): number {
  return dollars * DOLLARS_TO_M;
}

export function millionToDollars(value_M: number): number {
  return value_M / DOLLARS_TO_M;
}

export function formatBillion(value_B: number, digits = 3): string {
  if (!Number.isFinite(value_B)) return "—";
  return `$${value_B.toFixed(digits)}B`;
}

export function formatRatio(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function formatPct(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function clampTinyNegative(value: number, eps = 1e-12): number {
  if (value < 0 && value > -eps) return 0;
  return value;
}
