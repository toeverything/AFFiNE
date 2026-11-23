import { WorkbenchService } from '@affine/core/modules/workbench';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { MobileBackCoordinator } from '../modules/back-coordinator';
import { AppTabs } from './app-tabs';
import { MobileNavigationMenuHost } from './navigation/menu-host';

type TabsMetadata = {
  background?: string;
  hidden?: boolean;
};

const TabsMetadataContext = createContext<
  ((metadata: TabsMetadata | null) => void) | null
>(null);

export const useMobileShellTabs = (metadata: TabsMetadata = {}) => {
  const setMetadata = useContext(TabsMetadataContext);
  const background = metadata.background;
  const hidden = metadata.hidden;
  useEffect(() => {
    setMetadata?.({ background, hidden });
    return () => setMetadata?.(null);
  }, [background, hidden, setMetadata]);
};

export const MobileShellHost = ({ children }: PropsWithChildren) => {
  const [metadata, setMetadata] = useState<TabsMetadata | null>(null);
  const value = useMemo(() => setMetadata, []);
  const workbench = useService(WorkbenchService).workbench;
  const workspaceSelectorOpen = useLiveData(workbench.workspaceSelectorOpen$);
  const backCoordinator = useService(MobileBackCoordinator);

  useEffect(() => {
    if (!workspaceSelectorOpen) return;
    const registration = backCoordinator.registerVisual({
      handle: () => workbench.closeWorkspaceSelector(),
    });
    return registration.dispose;
  }, [backCoordinator, workbench, workspaceSelectorOpen]);

  return (
    <TabsMetadataContext.Provider value={value}>
      <MobileNavigationMenuHost>{children}</MobileNavigationMenuHost>
      <AppTabs
        background={
          metadata?.background ?? cssVarV2('layer/background/mobile/primary')
        }
        hidden={metadata?.hidden}
      />
    </TabsMetadataContext.Provider>
  );
};
