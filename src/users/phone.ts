/** Store Russian local numbers in international form; accept international numbers too. */
export function normalizePhone(value: unknown): unknown {
  if (typeof value !== "string") return value;
  let digits = value.replace(/[\s()+-]/g, "");
  if (/^8\d{10}$/.test(digits)) digits = `7${digits.slice(1)}`;
  if (/^\d{10}$/.test(digits)) digits = `7${digits}`;
  return /^\d{11,15}$/.test(digits) ? `+${digits}` : value.trim();
}

export function phoneLookupKey(value: unknown): string | null {
  const normalized = normalizePhone(value);
  return typeof normalized === "string" && /^\+[1-9]\d{10,14}$/.test(normalized)
    ? normalized
    : null;
}
