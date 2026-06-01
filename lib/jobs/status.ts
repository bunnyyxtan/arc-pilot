export const JOB_STATUS = {
  OPEN: 0,
  FUNDED: 1,
  RUNNING: 2,
  SUBMITTED: 3,
  COMPLETED: 4,
  REJECTED: 5,
  DISPUTED: 6,
  EXPIRED: 7,
  REFUNDED: 8
} as const;

export const JOB_STATUS_LABELS = [
  "Open",
  "Funded",
  "Running",
  "Submitted",
  "Completed",
  "Rejected",
  "Disputed",
  "Expired",
  "Refunded"
] as const;

export function normalizeJobStatus(value: unknown): number | null {
  try {
    const status = Number(value);
    return Number.isInteger(status) && status >= 0 && status < JOB_STATUS_LABELS.length ? status : null;
  } catch {
    return null;
  }
}

export function getJobStatusLabel(value: unknown) {
  const status = normalizeJobStatus(value);
  return status === null ? "Unknown" : JOB_STATUS_LABELS[status];
}

export function isJobStatus(value: unknown, expected: number) {
  return normalizeJobStatus(value) === expected;
}
