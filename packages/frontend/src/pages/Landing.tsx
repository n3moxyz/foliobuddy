import { useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/layout/BrandMark';
import { HeroDashboard } from '@/components/landing/HeroDashboard';
import { ScrollStory } from '@/components/landing/ScrollStory';
import { CapabilityBento } from '@/components/landing/CapabilityBento';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Reveal } from '@/components/landing/Reveal';

/**
 * Public landing page at / for signed-out visitors. Forces the dark visual
 * identity (the app's primary, optimized theme) regardless of OS preference —
 * this is the one art-directed surface of the product.
 */
export default function Landing() {
  useEffect(() => {
    document.title = 'FolioBuddy — every asset, one quiet dashboard';
    return () => {
      document.title = 'FolioBuddy';
    };
  }, []);

  const scrollToStory = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    document.getElementById('story')?.scrollIntoView({ behavior });
  };

  return (
    <div className="dark min-h-screen bg-background font-sans text-foreground antialiased">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-7 w-7" />
            <span className="text-[15px] font-bold tracking-tight">FolioBuddy</span>
          </div>
          <Button asChild size="sm" className="landing-press">
            <Link to="/sign-in">Sign in</Link>
          </Button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section aria-labelledby="hero-heading" className="relative overflow-hidden">
          <div
            className="landing-grid-bg pointer-events-none absolute inset-0"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 sm:pb-24 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-28">
            <div className="animate-fade-in-up">
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Private portfolio dashboard
              </div>
              <h1
                id="hero-heading"
                className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]"
              >
                Every asset you own.
                <br />
                One quiet dashboard.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                FolioBuddy tracks crypto, equities, funds and cash side by side — live prices, daily
                snapshots, honest benchmarks. The full picture, without the spreadsheet.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="landing-press">
                  <Link to="/sign-in">Sign in</Link>
                </Button>
                <Button asChild variant="ghost" size="lg" className="landing-press">
                  <a href="#story" onClick={scrollToStory}>
                    See how it works
                    <ArrowDown className="ml-1.5 h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
              <p className="mt-5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Private · access by invitation
              </p>
            </div>

            <div className="animate-fade-in-up [animation-delay:120ms]">
              <HeroDashboard />
            </div>
          </div>
        </section>

        {/* Scroll story */}
        <div id="story" className="border-t border-border/60">
          <ScrollStory />
        </div>

        {/* Capabilities */}
        <div className="border-t border-border/60 py-20 sm:py-28">
          <CapabilityBento />
        </div>

        {/* How it works */}
        <div className="border-t border-border/60 py-20 sm:py-28">
          <HowItWorks />
        </div>

        {/* Closing CTA */}
        <div className="border-t border-border/60">
          <section
            aria-labelledby="cta-heading"
            className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6 sm:py-32"
          >
            <Reveal>
              <BrandMark className="mx-auto h-12 w-12" />
              <h2
                id="cta-heading"
                className="mx-auto mt-6 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl"
              >
                The full picture is waiting.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                FolioBuddy is a private tool for a small circle. If you have access, sign in with
                your Google account.
              </p>
              <div className="mt-8">
                <Button asChild size="lg" className="landing-press">
                  <Link to="/sign-in">Sign in</Link>
                </Button>
              </div>
            </Reveal>
          </section>
        </div>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <BrandMark className="h-5 w-5" />
            <span className="text-sm font-semibold">FolioBuddy</span>
          </div>
          <p className="text-xs text-muted-foreground">
            A personal portfolio dashboard · foliobuddy.xyz
          </p>
        </div>
      </footer>
    </div>
  );
}
