const SINGAPORE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAILY_SNAPSHOT_HOUR_SGT = 5;

function inSingapore(date: Date): Date {
  return new Date(date.getTime() + SINGAPORE_UTC_OFFSET_MS);
}

export function isSameSingaporeDay(left: Date, right: Date): boolean {
  const singaporeLeft = inSingapore(left);
  const singaporeRight = inSingapore(right);

  return (
    singaporeLeft.getUTCFullYear() === singaporeRight.getUTCFullYear() &&
    singaporeLeft.getUTCMonth() === singaporeRight.getUTCMonth() &&
    singaporeLeft.getUTCDate() === singaporeRight.getUTCDate()
  );
}

export function isBeforeDailySnapshotTime(now: Date): boolean {
  return inSingapore(now).getUTCHours() < DAILY_SNAPSHOT_HOUR_SGT;
}
