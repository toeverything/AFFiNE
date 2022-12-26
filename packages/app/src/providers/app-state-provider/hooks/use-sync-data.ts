import { useEffect } from 'react';
import {
  AccessTokenMessage,
  getWorkspaces,
  token,
} from '@pathfinder/data-services';
import { LoadWorkspaceHandler } from '../context';

export const useSyncData = ({
  loadWorkspaceHandler,
}: {
  loadWorkspaceHandler: LoadWorkspaceHandler;
}) => {
  useEffect(() => {
    if (!loadWorkspaceHandler) {
      return;
    }
    const start = async () => {
      const isLogin = await token.refreshToken().catch(() => false);
    };
    start();

    const callback = async (user: AccessTokenMessage | null) => {
      const workspacesMeta = user
        ? await getWorkspaces().catch(() => {
            return [];
          })
        : [];
      // setState(state => ({
      //   ...state,
      //   user: user,
      //   workspacesMeta,
      //   synced: true,
      // }));
    };

    token.onChange(callback);
    token.refreshToken().catch(err => {
      // FIXME: should resolve invalid refresh token
      console.log(err);
    });
    return () => {
      token.offChange(callback);
    };
  }, [loadWorkspaceHandler]);
};
