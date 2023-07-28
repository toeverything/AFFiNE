import { WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteTemporarilyIcon,
  FolderIcon,
  SettingsIcon,
} from '@blocksuite/icons';
import { useAtom } from 'jotai';
import type { FC, SVGProps } from 'react';
import { useMemo } from 'react';

import { openSettingModalAtom } from '../../../atoms';

export type Config =
  | {
      title: string;
      icon: FC<SVGProps<SVGSVGElement>>;
      subPath: WorkspaceSubPath;
    }
  | {
      title: string;
      icon: FC<SVGProps<SVGSVGElement>>;
      onClick: () => void;
    };

export const useSwitchToConfig = (workspaceId: string): Config[] => {
  const t = useAFFiNEI18N();
  const [, setOpenSettingModalAtom] = useAtom(openSettingModalAtom);
  return useMemo(
    () => [
      {
        title: t['All pages'](),
        subPath: WorkspaceSubPath.ALL,
        icon: FolderIcon,
      },
      {
        title: t['Workspace Settings'](),
        onClick: () => {
          setOpenSettingModalAtom({
            open: true,
            activeTab: 'workspace',
            workspaceId,
          });
        },
        icon: SettingsIcon,
      },
      {
        title: t['Trash'](),
        subPath: WorkspaceSubPath.TRASH,
        icon: DeleteTemporarilyIcon,
      },
    ],
    [t, workspaceId, setOpenSettingModalAtom]
  );
};
