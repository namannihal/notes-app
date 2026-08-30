'use client';

import { Flame } from 'lucide-react';
import { useStreak } from '@/hooks/useStreak';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayInitial(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return DAY_INITIALS[new Date(y, m - 1, d).getDay()];
}

/**
 * Writing streak. Deliberately understated: a number in the header, detail only
 * on demand. No nagging copy, no reward animation — the point is a gentle record
 * of practice, not a game that punishes a missed day.
 */
export function StreakBadge() {
  const streak = useStreak();
  if (!streak || streak.total === 0) return null;

  const { current, longest, recent, writtenToday } = streak;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'flex items-center gap-1 rounded-md px-1.5 py-1 text-xs tabular-nums transition-colors',
          'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          writtenToday ? 'text-foreground' : 'text-muted-foreground',
        )}
        title={`${current}-day writing streak`}
      >
        <Flame className={cn('size-3.5', writtenToday && 'text-primary')} />
        {current}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-lg p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-semibold tabular-nums leading-none">{current}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              day{current === 1 ? '' : 's'} in a row
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium tabular-nums leading-none">{longest}</div>
            <div className="mt-1 text-xs text-muted-foreground">longest</div>
          </div>
        </div>

        <div className="mt-4 flex justify-between gap-1">
          {recent.map(({ day, active }, i) => (
            <div key={day} className="flex flex-1 flex-col items-center gap-1.5">
              <span
                className={cn(
                  'h-6 w-full rounded-[5px] transition-colors',
                  active ? 'bg-primary' : 'bg-muted',
                )}
              />
              <span className="text-[10px] leading-none text-muted-foreground">
                {i === 6 ? 'Today' : dayInitial(day)}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {writtenToday
            ? 'You have written today.'
            : 'Your streak holds until the end of tomorrow.'}
        </p>
      </PopoverContent>
    </Popover>
  );
}
