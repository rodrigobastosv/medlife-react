import { Link } from 'react-router-dom';

import { routes } from '@/app/routing/routes';
import { buttonClasses } from '@/design-system/components/button-classes';

/** The catch-all route: a typo in the URL, or a link to something removed. */
export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-2xl font-bold">Página não encontrada</h1>
      <p className="text-on-surface-variant">O endereço acessado não existe no MedLife.</p>
      <Link to={routes.home} className={buttonClasses()}>
        Voltar ao início
      </Link>
    </div>
  );
}
