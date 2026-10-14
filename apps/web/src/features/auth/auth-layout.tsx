import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Brand } from '@/components/brand';
import { CheckItem } from '@/components/check-item';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  const { t } = useTranslation();
  const proof = t('auth.proof', { returnObjects: true }) as { title: string; description: string }[];

  return (
    <div className="glow-shell flex min-h-dvh flex-col px-4 sm:px-6">
      <header className="mx-auto w-full max-w-[1140px] py-6">
        <Brand />
      </header>
      <main className="mx-auto grid w-full max-w-[1140px] flex-1 items-center pb-12">
        <div className="reveal grid overflow-hidden rounded-xl shadow-soft lg:grid-cols-2">
          <section className="hidden flex-col justify-between gap-10 bg-primary p-10 text-white lg:flex dark:bg-deep">
            <div>
              <span className="text-sm font-medium text-white/60">{t('auth.eyebrow')}</span>
              <h2 className="mt-3 max-w-[16ch] text-4xl leading-[1.1] font-bold tracking-[-0.03em]">
                {t('auth.headline')}
              </h2>
              <p className="mt-4 max-w-[44ch] leading-relaxed text-white/75">{t('auth.pitch')}</p>
            </div>
            <div className="grid gap-5 border-t border-white/15 pt-8">
              {proof.map((item) => (
                <CheckItem key={item.title} {...item} />
              ))}
            </div>
          </section>
          <section className="border bg-card p-7 sm:p-10 lg:border-0">
            <div className="mx-auto grid max-w-sm gap-8">
              <div className="grid gap-2">
                <h1 className="text-3xl font-bold tracking-[-0.03em]">{title}</h1>
                <p className="text-muted-foreground">{subtitle}</p>
              </div>
              {children}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
