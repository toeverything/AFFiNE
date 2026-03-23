import './queuedash.css';

import { QueueDashApp } from '@queuedash/ui';
import { useEffect } from 'react';

import { Header } from '../header';

const QUEUEDASH_SCOPE_CLASS = 'affine-queuedash';
const PORTAL_CONTENT_SELECTOR =
  '.react-aria-ModalOverlay, .react-aria-Menu, [data-rac][data-placement][data-trigger]';

export function QueuePage() {
  useEffect(() => {
    const marked = new Set<HTMLElement>();

    const markScopeRoot = (el: Element) => {
      if (!(el instanceof HTMLElement)) {
        return;
      }

      if (el.classList.contains(QUEUEDASH_SCOPE_CLASS)) {
        return;
      }

      el.classList.add(QUEUEDASH_SCOPE_CLASS);
      marked.add(el);
    };

    const isPortalContent = (el: Element) => {
      return (
        el.matches(PORTAL_CONTENT_SELECTOR) ||
        !!el.querySelector(PORTAL_CONTENT_SELECTOR)
      );
    };

    const markIfPortalRoot = (el: Element) => {
      if (!isPortalContent(el)) {
        return;
      }
      markScopeRoot(el);
    };

    const getBodyChildRoot = (el: Element) => {
      let current: Element | null = el;
      while (
        current?.parentElement &&
        current.parentElement !== document.body
      ) {
        current = current.parentElement;
      }
      return current?.parentElement === document.body ? current : null;
    };

    Array.from(document.body.children).forEach(child => {
      if (child.id === 'app') {
        return;
      }
      markIfPortalRoot(child);
    });

    const observer = new MutationObserver(mutations => {
      const appRoot = document.getElementById('app');
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          const root = getBodyChildRoot(node) ?? node;
          if (appRoot && root === appRoot) {
            continue;
          }
          markIfPortalRoot(root);
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      marked.forEach(el => el.classList.remove(QUEUEDASH_SCOPE_CLASS));
    };
  }, []);

  return (
    <div className="h-dvh flex-1 flex-col flex overflow-hidden">
      <Header title="Queue" />
      <div className="flex-1 overflow-hidden">
        <div className={`${QUEUEDASH_SCOPE_CLASS} h-full`}>
          <QueueDashApp
            apiUrl={`${environment.subPath}/api/queue/trpc`}
            basename="/admin/queue"
          />
        </div>
      </div>
    </div>
  );
}

export { QueuePage as Component };
