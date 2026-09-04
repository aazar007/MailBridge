'use client';

import { Check } from 'lucide-react';

const STEP_LABELS = ['SMTP Setup', 'Draft', 'Recipients', 'Preview', 'Send'];

export function CampaignStepper({
  current,
  onStepClick,
}: {
  current: number;
  onStepClick?: (step: number) => void;
}) {
  return (
    <div className="border-b border-border bg-background sticky top-[57px] z-10">
      <div className="flex overflow-x-auto">
        {STEP_LABELS.map((label, i) => {
          const idx = i + 1;
          const done = idx < current;
          const active = idx === current;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => done && onStepClick?.(idx)}
              disabled={idx > current}
              className={`flex items-center gap-2 px-4 py-3.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-all ${
                active
                  ? 'border-foreground text-foreground'
                  : done
                    ? 'border-transparent text-muted-foreground hover:text-foreground cursor-pointer'
                    : 'border-transparent text-muted-foreground/30 cursor-default'
              }`}
            >
              <span
                className={`size-5 rounded-full flex items-center justify-center text-[10px] shrink-0 font-mono transition-colors ${
                  done || active
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {done ? <Check className="size-3" /> : idx}
              </span>
              <span className="hidden sm:block">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { STEP_LABELS };
