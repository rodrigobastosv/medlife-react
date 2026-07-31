import { TopBanner } from '@/app/pwa/top-banner';
import { useOnlineStatus } from '@/app/pwa/use-online-status';
import { CloudOffIcon } from '@/design-system/components/icons';

/**
 * "You are offline", said out loud.
 *
 * The service worker precaches the shell, so the app opens without a network
 * and then every card fills with a load failure — an app that looks broken
 * rather than an app that is offline. Those are very different support calls.
 * Nothing here makes the app work offline; deliberately so, because the way to
 * do that is to persist the query cache, and a cached API response is a copy of
 * a patient's data that outlives the sign-out meant to remove it. The scope is
 * telling the truth, not surviving without a network.
 *
 * It shares the top slot with `PwaUpdatePrompt`, and this one wins: an update
 * prompt is latched and will still be waiting when the connection returns,
 * whereas the reason the screen looks wrong right now is only explained here.
 * The precedence is enforced in `PwaUpdatePrompt`, which stands down while
 * offline — pushing it there rather than nesting the two keeps each banner's
 * own render condition readable on its own.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <TopBanner className="border-warning bg-warning-container text-on-warning-container">
      <CloudOffIcon />
      <span className="min-w-40 flex-1">Sem conexão. Os dados podem estar desatualizados.</span>
    </TopBanner>
  );
}
