type BandwidthCycleSource = {
  status?: string | null;
  trialStartedAt?: string | null;
  currentPeriodStartedAt?: string | null;
};

type BandwidthCycleWindow = {
  start: Date;
  end: Date;
};

const startOfDayUtc = (value: Date): Date => {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

const getDaysInMonthUtc = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const addMonthsUtc = (value: Date, months: number): Date => {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const hours = value.getUTCHours();
  const minutes = value.getUTCMinutes();
  const seconds = value.getUTCSeconds();
  const ms = value.getUTCMilliseconds();

  const totalMonths = year * 12 + month + months;
  let targetYear = Math.floor(totalMonths / 12);
  let targetMonth = totalMonths % 12;
  if (targetMonth < 0) {
    targetMonth += 12;
    targetYear -= 1;
  }

  const daysInTargetMonth = getDaysInMonthUtc(targetYear, targetMonth);
  const clampedDay = Math.min(day, daysInTargetMonth);

  return new Date(
    Date.UTC(targetYear, targetMonth, clampedDay, hours, minutes, seconds, ms),
  );
};

const resolveAnchorDate = (
  source: BandwidthCycleSource | null | undefined,
  now: Date,
): Date => {
  const anchorRaw =
    source?.currentPeriodStartedAt ||
    (source?.status === "trialing" ? source?.trialStartedAt : null);
  if (anchorRaw) {
    return startOfDayUtc(new Date(anchorRaw));
  }
  const fallback = startOfDayUtc(now);
  fallback.setUTCDate(1);
  return fallback;
};

export const getBandwidthCycleWindow = (
  source: BandwidthCycleSource | null | undefined,
  now: Date = new Date(),
): BandwidthCycleWindow => {
  const anchor = resolveAnchorDate(source, now);

  if (now.getTime() < anchor.getTime()) {
    const cycleStart = anchor;
    const cycleEnd = startOfDayUtc(addMonthsUtc(cycleStart, 1));
    return { start: cycleStart, end: cycleEnd };
  }

  const monthsDiff =
    (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - anchor.getUTCMonth());

  let cycleStart = addMonthsUtc(anchor, monthsDiff);
  if (cycleStart.getTime() > now.getTime()) {
    cycleStart = addMonthsUtc(anchor, monthsDiff - 1);
  }

  cycleStart = startOfDayUtc(cycleStart);
  const cycleEnd = startOfDayUtc(addMonthsUtc(cycleStart, 1));

  return { start: cycleStart, end: cycleEnd };
};
