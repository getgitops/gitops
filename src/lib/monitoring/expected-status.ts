/**
 * Expected HTTP status expressions: comma-separated codes and ranges, `200-299`, `200,204`,
 * `200-299,301`. Codes are 100..599.
 */

type Range = { from: number; to: number };

export const DEFAULT_EXPECTED_STATUS = '200-299';

const PART = /^(\d{3})(?:\s*-\s*(\d{3}))?$/;

/** Ranges of the expression, or `null` when it is not valid. */
export function parseExpectedStatus(expression: string): Range[] | null {
  const parts = expression
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > 20) return null;

  const ranges: Range[] = [];
  for (const part of parts) {
    const match = PART.exec(part);
    if (!match) return null;
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (from < 100 || to > 599 || from > to) return null;
    ranges.push({ from, to });
  }
  return ranges;
}

export function isValidExpectedStatus(expression: string): boolean {
  return parseExpectedStatus(expression) !== null;
}

export function matchesExpectedStatus(expression: string, status: number): boolean {
  const ranges = parseExpectedStatus(expression) ?? parseExpectedStatus(DEFAULT_EXPECTED_STATUS)!;
  return ranges.some((range) => status >= range.from && status <= range.to);
}
