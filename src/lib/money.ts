/**
 * Integer-cents money helpers. All arithmetic happens in cents; PayPal and the
 * DB get 2-decimal strings via `fromCents`.
 */

export type Cents = number;

type DecimalLike = { toString(): string };

/** Convert a decimal amount (number, "12.5", Prisma Decimal) to integer cents. */
export function toCents(value: number | string | DecimalLike): Cents {
  const str = typeof value === "number" ? value.toFixed(2) : value.toString().trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) throw new Error(`Invalid money amount: ${str}`);
  const negative = str.startsWith("-");
  const [whole, frac = ""] = str.replace("-", "").split(".");
  // Round half-up on the third decimal.
  const padded = (frac + "000").slice(0, 3);
  let cents = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1;
  return negative ? -cents : cents;
}

/** Format integer cents as a PayPal-style 2-decimal string, e.g. 1250 -> "12.50". */
export function fromCents(cents: Cents): string {
  if (!Number.isInteger(cents)) throw new Error(`Cents must be an integer: ${cents}`);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const str = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${str}` : str;
}

export function sumCents(values: Cents[]): Cents {
  return values.reduce((acc, v) => acc + v, 0);
}

export function formatMoney(cents: Cents, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}
