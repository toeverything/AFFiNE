import { Separator } from '@affine/admin/components/ui/separator';
import { adminWorkspaceQuery } from '@affine/graphql';
import { useMemo } from 'react';

import { useQuery } from '../../../use-query';
import { RightPanelHeader } from '../../header';
import type { WorkspaceSharedLink } from '../schema';

export function WorkspaceSharedLinksPanel({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const { data } = useQuery({
    query: adminWorkspaceQuery,
    variables: {
      id: workspaceId,
      memberSkip: 0,
      memberTake: 0,
      memberQuery: undefined,
    },
  });

  const workspace = data?.adminWorkspace;

  const sharedLinks = useMemo<WorkspaceSharedLink[]>(() => {
    const links = workspace?.sharedLinks ?? [];
    return [...links].sort((a, b) => {
      const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [workspace?.sharedLinks]);

  if (!workspace) {
    return (
      <div className="flex flex-col h-full">
        <RightPanelHeader
          title="Shared Links"
          handleClose={onClose}
          handleConfirm={onClose}
          canSave={false}
        />
        <div className="p-6 text-sm text-muted-foreground">
          Workspace not found.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <RightPanelHeader
        title="Shared Links"
        handleClose={onClose}
        handleConfirm={onClose}
        canSave={false}
      />
      <div className="flex flex-col gap-3 overflow-y-auto p-4">
        {sharedLinks.length === 0 ? (
          <div className="text-sm text-muted-foreground">No shared links.</div>
        ) : (
          <div className="flex flex-col divide-y rounded-xl border border-border/60 bg-card shadow-sm">
            {sharedLinks.map(link => (
              <SharedLinkItem key={link.docId} link={link} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SharedLinkItem({ link }: { link: WorkspaceSharedLink }) {
  const title = link.title || link.docId;
  const sharedDate = formatSharedDate(link.publishedAt);

  return (
    <div className="flex flex-col gap-1 px-3 py-3">
      <div className="text-sm font-medium truncate">{title}</div>
      <div className="flex items-center gap-2 text-xs">
        <Separator className="h-3" orientation="vertical" />
        <span className="text-muted-foreground">Shared on {sharedDate}</span>
      </div>
    </div>
  );
}

function formatSharedDate(publishedAt?: string | null) {
  if (!publishedAt) {
    return 'Unknown';
  }

  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toISOString().slice(0, 10);
}
