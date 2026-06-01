export function parsePositiveIntParam(value: unknown) {
  const raw = typeof value === "string" || typeof value === "number" || typeof value === "bigint"
    ? String(value).trim()
    : "";
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : raw;
}

export function toBigIntSafe(value: unknown) {
  const parsed = parsePositiveIntParam(value);
  return parsed === null ? null : BigInt(parsed);
}

export function formatEntityId(value: unknown, fallback = "-") {
  const parsed = parsePositiveIntParam(value);
  return parsed === null ? fallback : String(parsed);
}
