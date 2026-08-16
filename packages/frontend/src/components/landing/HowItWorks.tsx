import { Reveal } from './Reveal';

const STEPS = [
  {
    title: 'Sign in with Google',
    detail: 'No forms, no passwords. Access is invite-only — FolioBuddy is a private tool.',
  },
  {
    title: 'Add what you own',
    detail:
      'Type positions in, paste them as JSON, or upload a broker statement. Cost basis, storage location and currency all captured.',
  },
  {
    title: 'Let it run',
    detail:
      'Prices refresh every minute. Once a day, at a time you choose, a snapshot records your whole portfolio — value, allocation, P&L.',
  },
  {
    title: 'Review with clear eyes',
    detail:
      "Benchmarks, drawdowns, trade postmortems. The record is always there when you want to think about your money — and quiet when you don't.",
  },
];

/** A real sequence, so numbered steps carry meaning here. */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="mx-auto max-w-6xl px-4 sm:px-6">
      <Reveal>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          How you'd use it
        </div>
        <h2 id="how-heading" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Set up once. Check in seconds.
        </h2>
      </Reveal>

      <ol className="mt-10 max-w-2xl">
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative flex gap-5 pb-10 last:pb-0">
            {/* Connector line */}
            {index < STEPS.length - 1 && (
              <span
                className="absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-px bg-border"
                aria-hidden="true"
              />
            )}
            <Reveal delay={index * 60} className="flex gap-5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-card font-mono text-sm text-primary">
                {index + 1}
              </span>
              <div className="pt-0.5">
                <h3 className="text-base font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {step.detail}
                </p>
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
