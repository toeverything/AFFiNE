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
import { type AllWorkspace, pathGenerator } from '../../../shared';

export const useSwitchToConfig = (
  workspace: AllWorkspace
): {
  title: string;
  href?: string;
  onClick?: () => void;
  icon: FC<SVGProps<SVGSVGElement>>;
}[] => {
  const t = useAFFiNEI18N();
  const [, setOpenSettingModalAtom] = useAtom(openSettingModalAtom);
  return useMemo(
    () => [
      {
        title: t['All pages'](),
        href: pathGenerator.all(workspace.id),
        icon: FolderIcon,
      },
      {
        title: t['Workspace Settings'](),
        onClick: () => {
          setOpenSettingModalAtom({
            open: true,
            activeTab: 'workspace',
            workspace: workspace,
          });
        },
        icon: SettingsIcon,
      },
      {
        title: t['Trash'](),
        href: pathGenerator.trash(workspace.id),
        icon: DeleteTemporarilyIcon,
      },
    ],
    [t, workspace, setOpenSettingModalAtom]
  );
};
