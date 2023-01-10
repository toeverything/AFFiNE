import { useAppState } from '@/providers/app-state-provider';
import { User } from '@affine/datacenter';
import { useEffect, useState } from 'react';

export const useUserHelper = () => {
  const { dataCenter } = useAppState();
  const [user, setUser] = useState<User | undefined>(undefined);
  useEffect(() => {
    dataCenter
      .getUserInfo()
      .then(user => {
        setUser(user);
      })
      .catch(e => {
        setUser(undefined);
      });
  }, []);

  const login = async () => {
    await dataCenter.login();
    const user = await dataCenter.getUserInfo();
    setUser(user);
  };
  return {
    user,
    login,
  };
};
