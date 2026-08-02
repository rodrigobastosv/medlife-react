import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { DoctorSwitcher } from '@/app/layout/doctor-switcher';
import { useSession } from '@/app/providers/session-context';
import { routes } from '@/app/routing/routes';
import { cn } from '@/design-system/cn';
import {
  BadgeIcon,
  CalendarIcon,
  ChartIcon,
  CloseIcon,
  HomeIcon,
  Logo,
  MenuIcon,
  PeopleIcon,
  SettingsIcon,
} from '@/design-system/components/icons';

/**
 * The frame around every authenticated screen: a sidebar on wide viewports, a
 * top bar with a drawer on narrow ones.
 *
 * The layout decision is made by **available width**, never by device — a narrow
 * browser window on a desktop gets the same layout as a phone, and a tablet in
 * landscape gets the sidebar. That is the `MLBreakpoints` rule, and in CSS it is
 * free: the `lg:` prefix *is* a width query. Note there is no `useMediaQuery`
 * hook and no window-size state here; letting CSS answer a CSS question avoids
 * a re-render on every resize and renders correctly on the first frame.
 */
export function AppShell() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);

  // The same bridge `ConfirmDialog` and `PatientPickerDialog` use: `<dialog>`'s
  // modal behaviour lives in a method, not an attribute.
  useEffect(() => {
    const drawer = drawerRef.current;
    if (drawer === null) return;
    if (isDrawerOpen && !drawer.open) drawer.showModal();
    if (!isDrawerOpen && drawer.open) drawer.close();
  }, [isDrawerOpen]);

  // The one thing CSS cannot do here. Everywhere else in this file the `lg:`
  // prefix decides the layout and no JavaScript watches the viewport — but a
  // modal dialog is in the browser's *top layer*, and hiding it with
  // `display: none` at `lg` would leave the page behind it inert with nothing on
  // screen to dismiss. So the drawer is dismissed when the sidebar takes over,
  // which is what a user who widened the window means anyway.
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 64rem)');
    const close = () => {
      if (wide.matches) setIsDrawerOpen(false);
    };
    close();
    wide.addEventListener('change', close);
    return () => wide.removeEventListener('change', close);
  }, []);

  return (
    <div className="min-h-dvh lg:flex">
      {/* Wide: a permanent sidebar. `hidden lg:flex` keeps it out of the DOM's
          accessibility tree entirely on narrow screens, so the drawer's links
          are not duplicated for a screen reader. */}
      <aside className="border-outline bg-surface sticky top-0 hidden h-dvh w-60 shrink-0 border-r lg:flex lg:flex-col">
        <SidebarContent />
      </aside>

      {/* Narrow: a top bar that opens the same navigation as a drawer. */}
      <header className="border-outline bg-surface sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 lg:hidden">
        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={isDrawerOpen}
          className="hover:bg-surface-container -m-2 cursor-pointer rounded-full p-2"
          onClick={() => setIsDrawerOpen(true)}
        >
          <MenuIcon />
        </button>
        <Logo className="size-7" />
        <span className="font-display text-primary font-bold">MedLife</span>
      </header>

      {/* A native `<dialog>`, for the reasons written up in `ConfirmDialog`:
          focus moves in, focus is *trapped*, Escape closes, and the page behind
          goes inert. This was the one overlay in the app that was a plain
          `<div>` — so it was also the one a keyboard user could tab straight
          out of, into a page they could not see, with no way to close it.

          The UA stylesheet centres a dialog and gives it a border, a padding and
          a max-width; `m-0 mr-auto` pins it to the left edge instead, and
          `open:flex` is what makes it a column only while it is open — a closed
          dialog must keep its `display: none`. */}
      <dialog
        ref={drawerRef}
        aria-label="Menu"
        onCancel={(event) => {
          event.preventDefault();
          setIsDrawerOpen(false);
        }}
        // A click on the ::backdrop is reported against the dialog element
        // itself, which is how the panel closes when you tap beside it.
        onClick={(event) => {
          if (event.target === drawerRef.current) setIsDrawerOpen(false);
        }}
        className="bg-surface text-on-surface m-0 mr-auto h-dvh max-h-none w-64 max-w-none flex-col p-0 backdrop:bg-black/40 open:flex"
      >
        <SidebarContent onNavigate={() => setIsDrawerOpen(false)} />
      </dialog>

      {/* `min-w-0` is the fix for the classic flex overflow: a flex child's
          default `min-width: auto` refuses to shrink below its content, so one
          wide table pushes the whole layout sideways instead of scrolling. */}
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}

interface Destination {
  to: string;
  label: string;
  icon: ReactNode;
  /** Hidden from a secretary. */
  doctorOnly?: boolean;
}

const DESTINATIONS: readonly Destination[] = [
  { to: routes.home, label: 'Início', icon: <HomeIcon /> },
  { to: routes.agenda, label: 'Agenda', icon: <CalendarIcon /> },
  { to: routes.patients, label: 'Pacientes', icon: <PeopleIcon /> },
  // Reports are financial end to end — revenue, average ticket, payment
  // methods. There is nothing in them to show someone who does not see money.
  { to: routes.reports, label: 'Relatórios', icon: <ChartIcon />, doctorOnly: true },
  { to: routes.secretaries, label: 'Secretárias', icon: <BadgeIcon />, doctorOnly: true },
  { to: routes.settings, label: 'Ajustes', icon: <SettingsIcon /> },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useSession();

  // Hiding a link is UX, not security: the route itself is guarded, and RLS is
  // what actually refuses the data to someone who types the URL.
  const destinations = DESTINATIONS.filter((item) => item.doctorOnly !== true || role === 'doctor');

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-5">
        <Logo className="size-8" />
        <span className="font-display text-primary text-lg font-bold">MedLife</span>
        {onNavigate !== undefined && (
          <button
            type="button"
            aria-label="Fechar menu"
            className="hover:bg-surface-container ml-auto cursor-pointer rounded-full p-2"
            onClick={onNavigate}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Navegação principal">
        {destinations.map((destination) => (
          <NavLink
            key={destination.to}
            to={destination.to}
            // `end` restricts the active match to an exact URL. Without it the
            // Início link (path "/") would be a prefix of every route and stay
            // highlighted everywhere; with it on the others, /patients/123 would
            // *stop* highlighting Pacientes. So: exact for the root, prefix for
            // the rest.
            end={destination.to === routes.home}
            onClick={onNavigate}
            // NavLink hands `isActive` to a className function, which is why the
            // active state needs no `useLocation` and no comparison of its own.
            className={({ isActive }) =>
              cn(
                'rounded-m flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface-variant hover:bg-surface-container',
              )
            }
          >
            {destination.icon}
            {destination.label}
          </NavLink>
        ))}
      </nav>

      <DoctorSwitcher />
    </>
  );
}
