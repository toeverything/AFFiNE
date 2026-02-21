import './queuedash.css';

import { QueueDashApp } from '@queuedash/ui';
import { useEffect } from 'react';

import { Header } from '../header';

const QUEUEDASH_SCOPE_CLASS = 'affine-queuedash';
const OVERLAY_CONTAINER_SELECTOR = '[data-overlay-container]';

export function QueuePage() {
  useEffect(() => {
    const marked = new Set<HTMLElement>();

    const markOverlayContainer = (el: Element) => {
      if (!(el instanceof HTMLElement)) {
        return;
      }

      if (el.classList.contains(QUEUEDASH_SCOPE_CLASS)) {
        return;
      }

      el.classList.add(QUEUEDASH_SCOPE_CLASS);
      marked.add(el);
    };

    const markOverlayContainers = (root: ParentNode) => {
      root.querySelectorAll(OVERLAY_CONTAINER_SELECTOR).forEach(el => {
        markOverlayContainer(el);
      });
    };

    markOverlayContainers(document);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          if (node.matches(OVERLAY_CONTAINER_SELECTOR)) {
            markOverlayContainer(node);
          } else {
            markOverlayContainers(node);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true });

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
