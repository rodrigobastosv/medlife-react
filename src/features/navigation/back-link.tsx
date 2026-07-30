import { Link } from 'react-router-dom';

import { ArrowBackIcon } from '@/design-system/components/icons';

/**
 * "Voltar" above a page title.
 *
 * It navigates to an explicit destination rather than calling `navigate(-1)`,
 * because browser history is not the app's hierarchy: someone who opened
 * `/patients/123` from a shared link has no previous page inside the app, and
 * "back" would take them out of it. A stated destination always works.
 */
export function BackLink({ to, label = 'Voltar' }: { to: string; label?: string }) {
  return (
    <Link
      to={to}
      className="text-on-surface-variant hover:text-primary mb-1 inline-flex items-center gap-1 text-sm"
    >
      <ArrowBackIcon className="size-4" />
      {label}
    </Link>
  );
}
