import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';

/**
 * Stops a form with unsaved edits from being walked away from silently.
 *
 * `vite.config.ts` already refuses to auto-apply a service worker update for
 * this exact reason — a reload mid-appointment eats what was typed, and this app
 * is used with a patient in the room. That care stopped at the service worker: a
 * sidebar link, the Back button or the "Voltar" at the top of the form all threw
 * the same half-filled form away without asking. This closes the gap, for the
 * appointment form and the patient form alike; one hook rather than two copies,
 * because the second copy is the one that never gets the fix.
 *
 * Two mechanisms are needed, because neither can see what the other does.
 * `useBlocker` covers the navigations the router performs — links, `navigate()`,
 * and the Back button, which React Router intercepts through the History API.
 * `beforeunload` covers the ones it never hears about: closing the tab,
 * reloading, typing a different address. The browser's dialog is ugly and its
 * wording is not ours to choose, but it is the only thing that can stop a tab
 * from closing.
 *
 * @param isDirty `formState.isDirty` from react-hook-form — deliberately *not*
 * "some field has a value". The edit form opens already populated, so a guard
 * that measured content would challenge someone who opened a record, read it and
 * left. A prompt that appears when nothing was typed is a prompt people learn to
 * click through, which is how the one that mattered gets dismissed too.
 */
export function useUnsavedChangesGuard(isDirty: boolean): UnsavedChangesGuard {
  /*
    Both flags are read through refs rather than through the closure, and that is
    what makes this hook subtle enough to deserve a note.

    `shouldBlock` is not called during render — the router calls it at the moment
    a navigation starts, which may be the same tick in which the state that would
    have changed the answer was set. React has not re-rendered yet, so a value
    captured at the last render is stale exactly when it matters:
    `allowNavigation()` immediately followed by `navigate()` is precisely the save
    flow. A ref is current the instant it is assigned, so the two cannot get out
    of order.
  */
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const isAllowedRef = useRef(false);

  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      isDirtyRef.current &&
      !isAllowedRef.current &&
      // Only a change of *page* threatens the form. The appointment form reads
      // its initial date out of the query string, and a search-param update is
      // not somebody walking away from their typing.
      currentLocation.pathname !== nextLocation.pathname,
    [],
  );

  const blocker = useBlocker(shouldBlock);

  useEffect(() => {
    if (!isDirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isAllowedRef.current) return;
      // Both, on purpose: `preventDefault()` is the specified way and what
      // current Chrome honours, while some browsers still act only on
      // `returnValue` being set. The string is never shown — browsers stopped
      // letting a page write that dialog years ago.
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  return {
    isPrompting: blocker.state === 'blocked',
    discardAndLeave: () => {
      if (blocker.state === 'blocked') blocker.proceed();
    },
    keepEditing: () => {
      if (blocker.state === 'blocked') blocker.reset();
    },
    allowNavigation: () => {
      isAllowedRef.current = true;
    },
  };
}

export interface UnsavedChangesGuard {
  /** True while a navigation is being held, waiting for the user to answer. */
  readonly isPrompting: boolean;
  /** Let the held navigation through; what was typed is gone. */
  readonly discardAndLeave: () => void;
  /** Cancel the held navigation and stay on the form. */
  readonly keepEditing: () => void;
  /**
   * Stand down for good — for the redirect the form itself performs after a
   * successful save or a delete.
   *
   * Without it the guard fires on the app's *own* navigation: react-hook-form
   * still reports the form as dirty after a save, since its values legitimately
   * differ from the defaults it was built with, so leaving the form would ask the
   * user whether to discard the changes they had just saved — a prompt on the
   * happy path, every time, which is worse than the problem being solved. Call it
   * immediately before navigating; the page is on its way out either way.
   */
  readonly allowNavigation: () => void;
}
