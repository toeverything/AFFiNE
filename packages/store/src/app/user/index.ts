import { User } from '@affine/datacenter';

import { GlobalActionsCreator } from '..';
import { dataCenterPromise } from '../datacenter';

export interface UserState {
  user: User | null;
  isOwner: boolean;
}

export interface UserActions {
  login: () => Promise<User | null>;
  logout: () => Promise<void>;
}

export const createUserState = (): UserState => ({
  // initialized in DataCenterLoader (restore from localStorage)
  user: null,
  isOwner: false,
});

export const createUserActions: GlobalActionsCreator<UserActions> = (
  set,
  get
) => {
  return {
    login: async () => {
      const { currentDataCenterWorkspace: workspace } = get();
      const dataCenter = await dataCenterPromise;
      try {
        await dataCenter.login();
        const user = (await dataCenter.getUserInfo()) as User;

        if (!user) {
          // Add ErrorBoundary
          throw new Error('User info not found');
        }

        let isOwner;
        if (workspace?.provider === 'local') {
          // isOwner is useful only in the cloud
          isOwner = true;
        } else {
          isOwner = user.id === workspace?.owner?.id;
        }

        set({ user, isOwner });
        return user;
      } catch (error) {
        return null; // login failed
      }
    },
    logout: async () => {
      const dataCenter = await dataCenterPromise;
      await dataCenter.logout();
      set({ user: null });
    },
  };
};
