import { noop } from 'lodash-es';
import { useEffect } from 'react';

export function useDocumentTitle(newTitle?: string | null) {
  useEffect(() => {
    if (environment.isDesktop || !newTitle) {
      return noop;
    }

    const oldTitle = document.title;
    document.title = newTitle;
    return () => {
      document.title = oldTitle;
    };
  }, [newTitle]);
}

export function usePageDocumentTitle(pageTitle?: string) {
  useDocumentTitle(pageTitle ? `${pageTitle} · AFFiNE` : null);
}
