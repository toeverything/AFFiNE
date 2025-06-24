import { Divider, Tooltip } from '@affine/component';
import { WorkbenchService } from '@affine/core/modules/workbench';
import {
  type WorkspaceMetadata,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import clsx from 'clsx';
import { memo, useCallback, useMemo } from 'react';

import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import { WorkspaceAvatar } from '../../workspace-avatar';
import * as styles from './index.css';

type WorkspaceProfile = ReturnType<WorkspacesService['getProfile']>;
interface WorkspaceInfo {
  profile: WorkspaceProfile;
  meta: WorkspaceMetadata;
}

interface TeamItemProps {
  workspaces: WorkspaceInfo[];
  badgeText: string;
}

const TeamItem = memo(({ workspaces, badgeText }: TeamItemProps) => {
  const t = useI18n();

  const { jumpToPage } = useNavigateHelper();
  const workbench = useServiceOptional(WorkbenchService)?.workbench;

  const handleJumpToWorkspace = useCallback(() => {
    const closeInactiveViews = () =>
      workbench?.views$.value.forEach(view => {
        if (workbench?.activeView$.value !== view) {
          workbench?.close(view);
        }
      });
    if (workspaces.length !== 1) {
      return;
    }

    if (document.startViewTransition) {
      document.startViewTransition(() => {
        closeInactiveViews();
        jumpToPage(workspaces[0].profile.id, 'all');
        return new Promise(resolve =>
          setTimeout(resolve, 150)
        ); /* start transition after 150ms */
      });
    } else {
      closeInactiveViews();
      jumpToPage(workspaces[0].profile.id, 'all');
    }
  }, [jumpToPage, workbench, workspaces]);

  const handleClick = useCallback(() => {
    if (workspaces.length === 1) {
      handleJumpToWorkspace();
    } else {
      workbench?.setWorkspaceSelectorOpen(true);
    }
  }, [handleJumpToWorkspace, workbench, workspaces.length]);

  if (workspaces.length === 0) return null;

  const displayName =
    workspaces.length > 1
      ? t['com.affine.workspace.cloud.account.team.multi']()
      : workspaces[0].profile.profile$.value?.name || 'Team';

  const tooltipContent =
    workspaces.length > 1
      ? t['com.affine.workspace.cloud.account.team.tips-2']()
      : t['com.affine.workspace.cloud.account.team.tips-1']();

  return (
    <Tooltip content={tooltipContent}>
      <div className={styles.teamWorkspace} onClick={handleClick}>
        <div className={styles.teamAvatarStack}>
          {workspaces.map((workspace, index) => (
            <WorkspaceAvatar
              key={workspace.profile.id}
              meta={workspace.meta}
              rounded={3}
              size={16}
              name={workspace.profile.profile$.value?.name}
              colorfulFallback
              className={clsx(styles.workspaceAvatar, {
                ['multi-avatar']: index !== 0,
              })}
            />
          ))}
        </div>
        <span className={styles.teamName}>{displayName}</span>
        <span className={styles.teamBadge}>{badgeText}</span>
      </div>
    </Tooltip>
  );
});

TeamItem.displayName = 'TeamItem';

export const TeamList = memo(() => {
  const t = useI18n();
  const workspacesService = useService(WorkspacesService);
  const workspaceMetas = useLiveData(workspacesService.list.workspaces$);
  const workspaceProfiles = workspacesService.getAllWorkspaceProfile();

  const teamWorkspaces = useMemo(() => {
    const ownerWorkspaces: WorkspaceInfo[] = [];
    const memberWorkspaces: WorkspaceInfo[] = [];

    const metaMap = new Map(workspaceMetas.map(meta => [meta.id, meta]));

    for (const profile of workspaceProfiles) {
      if (!profile.profile$.value?.isTeam) continue;

      const meta = metaMap.get(profile.id);
      if (!meta) continue;

      if (profile.profile$.value.isOwner) {
        ownerWorkspaces.push({ profile, meta });
      } else {
        memberWorkspaces.push({ profile, meta });
      }
    }
    // only show avatar stack when multiple workspaces
    const slicedOwnerWorkspaces = ownerWorkspaces.slice(0, 3);
    const slicedMemberWorkspaces = memberWorkspaces.slice(0, 3);

    return {
      ownerWorkspaces: slicedOwnerWorkspaces,
      memberWorkspaces: slicedMemberWorkspaces,
    };
  }, [workspaceProfiles, workspaceMetas]);

  if (
    teamWorkspaces.ownerWorkspaces.length === 0 &&
    teamWorkspaces.memberWorkspaces.length === 0
  ) {
    return null;
  }

  return (
    <>
      {teamWorkspaces.ownerWorkspaces.length > 0 && (
        <TeamItem
          workspaces={teamWorkspaces.ownerWorkspaces}
          badgeText={t['com.affine.workspace.cloud.account.team.owner']()}
        />
      )}
      {teamWorkspaces.memberWorkspaces.length > 0 && (
        <TeamItem
          workspaces={teamWorkspaces.memberWorkspaces}
          badgeText={t['com.affine.workspace.cloud.account.team.member']()}
        />
      )}
      <Divider />
    </>
  );
});

TeamList.displayName = 'TeamList';
