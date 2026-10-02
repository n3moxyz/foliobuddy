const singapore = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

export function singaporeSchedule(now, lastAttemptedDate) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error('The worker clock is invalid.');
  const parts = Object.fromEntries(
    singapore.formatToParts(now).map(({ type, value }) => [type, value])
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, due: Number(parts.hour) >= 6 && (!lastAttemptedDate || date > lastAttemptedDate) };
}
