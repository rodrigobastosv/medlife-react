import type { ReactNode } from 'react';

import { Logo } from '@/design-system/components/icons';

/** The frame shared by sign-in and sign-up: brand, card, one heading. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Logo className="size-10" />
          <span className="font-display text-primary text-2xl font-bold">MedLife</span>
        </div>

        <div className="bg-surface-container rounded-l p-6 sm:p-8">
          <h1 className="font-display text-xl font-bold">{title}</h1>
          <p className="text-on-surface-variant mt-1 mb-6 text-sm">{subtitle}</p>
          {children}
        </div>

        <p className="text-on-surface-variant mt-6 text-center text-sm">{footer}</p>
      </div>
    </div>
  );
}
