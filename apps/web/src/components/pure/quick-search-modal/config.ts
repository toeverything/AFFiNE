import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteTemporarilyIcon,
  FolderIcon,
  SettingsIcon,
} from '@blocksuite/icons';
import type { FC, SVGProps } from 'react';
import { useMemo } from 'react';

import { pathGenerator } from '../../../shared';
export const useSwitchToConfig = (
  workspaceId: string
): {
  title: string;
  href: string;
  icon: FC<SVGProps<SVGSVGElement>>;
}[] => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => [
      {
        title: t['All pages'](),
        href: pathGenerator.all(workspaceId),
        icon: FolderIcon,
      },
      {
        title: t['Workspace Settings'](),
        href: pathGenerator.setting(workspaceId),
        icon: SettingsIcon,
      },
      {
        title: t['Trash'](),
        href: pathGenerator.trash(workspaceId),
        icon: DeleteTemporarilyIcon,
      },
    ],
    [workspaceId, t]
  );
};
