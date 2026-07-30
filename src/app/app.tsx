import { RouterProvider } from 'react-router-dom';

import { QueryProvider } from '@/app/providers/query-provider';
import { SessionProvider } from '@/app/providers/session-provider';
import { ThemeProvider } from '@/app/providers/theme-provider';
import { ToastProvider } from '@/app/providers/toast-provider';
import { router } from '@/app/routing/router';

/**
 * The provider stack, and the order matters.
 *
 * `QueryProvider` is outermost of the two data providers because `SessionProvider`
 * *uses* queries (it loads the profile and the linked doctors), and a hook cannot
 * reach a provider that is inside it. `ThemeProvider` and `ToastProvider` have no
 * dependencies, so their position is only about who needs them: everything.
 *
 * The router goes last, so every route already has a session, a cache and a way
 * to show a message.
 */
export function App() {
  return (
    <ThemeProvider>
      <QueryProvider>
        <ToastProvider>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </ToastProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
