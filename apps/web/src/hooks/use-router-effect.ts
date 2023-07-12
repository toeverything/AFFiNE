import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
} from '@affine/workspace/atom';
import { useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function useRouterEffect() {
  const router = useRouter();
  const setCurrentWorkspaceId = useSetAtom(rootCurrentWorkspaceIdAtom);
  const setCurrentPageId = useSetAtom(rootCurrentPageIdAtom);
  useEffect(() => {
    if (!environment.isServer) {
      const callback = (url: string) => {
        const value = url.split('/')[2];
        if (value) {
          setCurrentWorkspaceId(value);
          localStorage.setItem('last_workspace_id', value);
        } else {
          setCurrentWorkspaceId(null);
        }
      };
      callback(window.location.pathname);
      router.events.on('routeChangeStart', callback);
      return () => {
        router.events.off('routeChangeStart', callback);
      };
    }
    return () => {};
  }, [router.events, setCurrentWorkspaceId]);
  useEffect(() => {
    if (!environment.isServer) {
      const callback = (url: string) => {
        const value = url.split('/')[3];
        if (value) {
          setCurrentPageId(value);
        } else {
          setCurrentPageId(null);
        }
      };
      callback(window.location.pathname);
      router.events.on('routeChangeStart', callback);
      return () => {
        router.events.off('routeChangeStart', callback);
      };
    }
    return () => {};
  }, [router.events, setCurrentPageId]);
}
