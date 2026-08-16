import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { useUpdateUserPreferences, useUserPreferences } from '@/hooks/useUserPreferences';
import {
  DEFAULT_SNAPSHOT_HOUR,
  DEFAULT_SNAPSHOT_TIMEZONE,
  describeNextSnapshot,
  formatTimeZoneLabel,
  formatUtcOffset,
  getTimeZoneGroups,
  SNAPSHOT_HOUR_OPTIONS,
} from '@/lib/snapshotPreferences';

/**
 * Settings → "Daily snapshot": pick the local hour + timezone at which
 * FolioBuddy records your portfolio each day. Defaults to 5:00 AM Singapore.
 */
export function SnapshotScheduleSection() {
  const { data, isLoading, isError } = useUserPreferences();
  const update = useUpdateUserPreferences();

  const hour = data?.snapshotHour ?? DEFAULT_SNAPSHOT_HOUR;
  const zone = data?.snapshotTimezone ?? DEFAULT_SNAPSHOT_TIMEZONE;

  // Zone list is static for the session; group it once.
  const groups = useMemo(() => getTimeZoneGroups(), []);
  const next = useMemo(() => describeNextSnapshot(hour, zone), [hour, zone]);
  const zoneOffset = formatUtcOffset(zone);

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold">Daily Snapshot</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        When FolioBuddy records your portfolio each day
      </p>

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="snapshot-hour">Snapshot time</Label>
              <HelpTooltip
                label="About snapshot time"
                content="Each day at this local time, FolioBuddy saves your total value, allocation and per-position P&L. Weekly and monthly snapshots use the same time on your Sunday and 1st of the month."
              />
            </div>
            <p className="text-sm text-muted-foreground">Local time in your chosen timezone</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-11 w-full sm:h-10 sm:w-[140px]" />
          ) : (
            <Select
              value={String(hour)}
              disabled={isError || update.isPending}
              onValueChange={(value) => update.mutate({ snapshotHour: Number(value) })}
            >
              <SelectTrigger id="snapshot-hour" className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SNAPSHOT_HOUR_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Label htmlFor="snapshot-timezone">Timezone</Label>
            <p className="text-sm text-muted-foreground">
              {formatTimeZoneLabel(zone)}
              {zoneOffset ? ` · ${zoneOffset}` : ''}
            </p>
          </div>
          {isLoading ? (
            <Skeleton className="h-11 w-full sm:h-10 sm:w-[240px]" />
          ) : (
            <Select
              value={zone}
              disabled={isError || update.isPending}
              onValueChange={(value) => update.mutate({ snapshotTimezone: value })}
            >
              <SelectTrigger id="snapshot-timezone" className="w-full sm:w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {groups.map((group) => (
                  <SelectGroup key={group.region}>
                    <SelectLabel>{group.region}</SelectLabel>
                    {group.zones.map((z) => (
                      <SelectItem key={z} value={z}>
                        {z === 'UTC' ? 'UTC' : formatTimeZoneLabel(z)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {isError && (
          <p role="alert" className="text-sm text-loss">
            Couldn't load your snapshot schedule. Refresh to try again.
          </p>
        )}

        {!isLoading && !isError && next && (
          <div className="rounded-md bg-muted p-3">
            <p className="text-sm">
              Next snapshot: {next.isToday ? 'today' : 'tomorrow'} at{' '}
              <span className="font-mono">{next.local}</span> {formatTimeZoneLabel(zone)} time
              {next.viewer !== next.local && (
                <span className="text-muted-foreground">
                  {' '}
                  · <span className="font-mono">{next.viewer}</span> your time
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Changes apply from the next scheduled snapshot. Only one snapshot per day is kept.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
