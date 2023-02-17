import { useCallback, useEffect, useState } from 'react';
import { Member } from '@affine/datacenter';
import { useGlobalState } from '@/store/app';
export const useMembers = () => {
  const dataCenter = useGlobalState(store => store.dataCenter);
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const [members, setMembers] = useState<Member[]>([]);
  const [loaded, setLoaded] = useState(false);
  const refreshMembers = useCallback(async () => {
    if (!currentWorkspace || !dataCenter) return;
    const members = await dataCenter.getMembers(currentWorkspace.id);
    setMembers(members ?? []);
  }, [dataCenter, currentWorkspace]);

  useEffect(() => {
    const init = async () => {
      await refreshMembers();
      setLoaded(true);
    };
    init();
  }, [refreshMembers]);

  const inviteMember = async (email: string) => {
    currentWorkspace &&
      dataCenter &&
      (await dataCenter.inviteMember(currentWorkspace.id, email));
  };

  const removeMember = async (permissionId: number) => {
    if (!currentWorkspace || !dataCenter) {
      return;
    }
    setLoaded(false);
    await dataCenter.removeMember(currentWorkspace.id, permissionId);
    await refreshMembers();
    setLoaded(true);
  };

  const getUserByEmail = async (email: string) => {
    if (!currentWorkspace) return null;
    return dataCenter?.getUserByEmail(currentWorkspace.id, email);
  };
  return {
    members,
    removeMember,
    inviteMember,
    getUserByEmail,
    loaded,
  };
};

export default useMembers;
