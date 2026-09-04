import { AppLogo } from '@/components/app-logo';
import { TransitionLink } from '@/components/transition-link';

export function LegalLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-background px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <TransitionLink href="/main" className="text-xs font-semibold text-muted-foreground hover:text-foreground">
          ← Back to app
        </TransitionLink>
        <div className="flex items-center gap-2.5">
          <AppLogo size={32} />
          <div>
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
            <p className="text-muted-foreground text-xs mt-0.5">{subtitle}</p>
          </div>
        </div>
      </header>

      <article className="max-w-2xl mx-auto px-5 py-10 pb-16">
        <div className="border border-border rounded-lg bg-card px-6 py-8 space-y-6 text-sm text-foreground/90 leading-relaxed">
          {children}
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <TransitionLink href="/privacy" className="hover:text-foreground underline-offset-2 hover:underline">
            Privacy Policy
          </TransitionLink>
          <span aria-hidden="true">·</span>
          <TransitionLink href="/terms" className="hover:text-foreground underline-offset-2 hover:underline">
            Terms of Service
          </TransitionLink>
          <span aria-hidden="true">·</span>
          <TransitionLink href="/main" className="hover:text-foreground underline-offset-2 hover:underline">
            MailBridge
          </TransitionLink>
        </footer>
      </article>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-bold text-foreground mb-2">{title}</h2>
      <div className="space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}
