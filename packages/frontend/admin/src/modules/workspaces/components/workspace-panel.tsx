import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@affine/admin/components/ui/avatar';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { Separator } from '@affine/admin/components/ui/separator';
import { Switch } from '@affine/admin/components/ui/switch';
import {
  adminUpdateWorkspaceMutation,
  adminWorkspaceQuery,
  adminWorkspacesQuery,
  FeatureType,
} from '@affine/graphql';
import { AccountIcon } from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { FeatureToggleList } from '../../../components/shared/feature-toggle-list';
import { useMutateQueryResource, useMutation } from '../../../use-mutation';
import { useQuery } from '../../../use-query';
import { useServerConfig } from '../../common';
import { RightPanelHeader } from '../../header';
import { useRightPanel } from '../../panel/context';
import type { WorkspaceDetail } from '../schema';
import { formatBytes } from '../utils';

export function WorkspacePanel({
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
      memberTake: 20,
    },
  });
  const workspace = data.adminWorkspace;

  if (!workspace) {
    return (
      <div className="flex flex-col h-full">
        <RightPanelHeader
          title="Workspace"
          handleClose={onClose}
          handleConfirm={onClose}
          canSave={false}
        />
        <div
          className="p-6 text-sm"
          style={{ color: cssVarV2('text/secondary') }}
        >
          Workspace not found.
        </div>
      </div>
    );
  }

  return <WorkspacePanelContent workspace={workspace} onClose={onClose} />;
}

function WorkspacePanelContent({
  workspace,
  onClose,
}: {
  workspace: WorkspaceDetail;
  onClose: () => void;
}) {
  const serverConfig = useServerConfig();
  const { setHasDirtyChanges } = useRightPanel();
  const revalidate = useMutateQueryResource();
  const { trigger: updateWorkspace, isMutating } = useMutation({
    mutation: adminUpdateWorkspaceMutation,
  });

  const normalizedWorkspace = useMemo(
    () => ({
      features: [...workspace.features],
      flags: {
        public: workspace.public,
        enableAi: workspace.enableAi,
        enableSharing: workspace.enableSharing,
        enableUrlPreview: workspace.enableUrlPreview,
        enableDocEmbedding: workspace.enableDocEmbedding,
        name: workspace.name ?? '',
      },
    }),
    [workspace]
  );

  const [featureSelection, setFeatureSelection] = useState<FeatureType[]>(
    normalizedWorkspace.features
  );
  const [flags, setFlags] = useState(normalizedWorkspace.flags);
  const [baseline, setBaseline] = useState(normalizedWorkspace);

  useEffect(() => {
    setFeatureSelection(normalizedWorkspace.features);
    setFlags(normalizedWorkspace.flags);
    setBaseline(normalizedWorkspace);
  }, [normalizedWorkspace]);

  const hasChanges = useMemo(() => {
    return (
      flags.public !== baseline.flags.public ||
      flags.enableAi !== baseline.flags.enableAi ||
      flags.enableSharing !== baseline.flags.enableSharing ||
      flags.enableUrlPreview !== baseline.flags.enableUrlPreview ||
      flags.enableDocEmbedding !== baseline.flags.enableDocEmbedding ||
      flags.name !== baseline.flags.name ||
      featureSelection.length !== baseline.features.length ||
      featureSelection.some(f => !baseline.features.includes(f))
    );
  }, [baseline, featureSelection, flags]);

  useEffect(() => {
    setHasDirtyChanges(hasChanges);
  }, [hasChanges, setHasDirtyChanges]);

  const handleFeaturesChange = useCallback((features: FeatureType[]) => {
    setFeatureSelection(features);
  }, []);

  const handleSave = useCallback(() => {
    const update = async () => {
      try {
        await updateWorkspace({
          input: {
            id: workspace.id,
            public: flags.public,
            enableAi: flags.enableAi,
            enableSharing: flags.enableSharing,
            enableUrlPreview: flags.enableUrlPreview,
            enableDocEmbedding: flags.enableDocEmbedding,
            name: flags.name || null,
            features: featureSelection,
          },
        });
        await Promise.all([
          revalidate(adminWorkspacesQuery),
          revalidate(adminWorkspaceQuery, vars => vars?.id === workspace.id),
        ]);
        toast.success('Workspace updated successfully');
        setBaseline({
          flags: { ...flags },
          features: [...featureSelection],
        });
        setHasDirtyChanges(false);
        onClose();
      } catch (e) {
        toast.error(`Failed to update workspace: ${(e as Error).message}`);
      }
    };
    update().catch(() => {});
  }, [
    featureSelection,
    flags,
    onClose,
    revalidate,
    setBaseline,
    setHasDirtyChanges,
    updateWorkspace,
    workspace.id,
  ]);

  const memberList = workspace.members ?? [];

  return (
    <div className="flex flex-col h-full">
      <RightPanelHeader
        title="Update Workspace"
        handleClose={onClose}
        handleConfirm={handleSave}
        canSave={hasChanges && !isMutating}
      />
      <div className="p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="border rounded-md p-3 space-y-2">
          <div
            className="text-xs"
            style={{ color: cssVarV2('text/secondary') }}
          >
            Workspace ID
          </div>
          <div className="text-sm font-mono break-all">{workspace.id}</div>
          <div className="flex flex-col gap-1">
            <Label
              className="text-xs"
              style={{ color: cssVarV2('text/secondary') }}
            >
              Name
            </Label>
            <Input
              value={flags.name}
              onChange={e =>
                setFlags(prev => ({ ...prev, name: e.target.value }))
              }
              placeholder="Workspace name"
            />
          </div>
        </div>

        <div className="border rounded-md">
          <FlagItem
            label="Public"
            description="Allow public access to workspace pages"
            checked={flags.public}
            onCheckedChange={value =>
              setFlags(prev => ({ ...prev, public: value }))
            }
          />
          <Separator />
          <FlagItem
            label="Enable AI"
            description="Allow AI features in this workspace"
            checked={flags.enableAi}
            onCheckedChange={value =>
              setFlags(prev => ({ ...prev, enableAi: value }))
            }
          />
          <Separator />
          <FlagItem
            label="Enable URL Preview"
            description="Allow URL previews in shared pages"
            checked={flags.enableUrlPreview}
            onCheckedChange={value =>
              setFlags(prev => ({ ...prev, enableUrlPreview: value }))
            }
          />
          <Separator />
          <FlagItem
            label="Allow Workspace Sharing"
            description="Allow pages in this workspace to be shared publicly"
            checked={flags.enableSharing}
            onCheckedChange={value =>
              setFlags(prev => ({ ...prev, enableSharing: value }))
            }
          />
          <Separator />
          <FlagItem
            label="Enable Doc Embedding"
            description="Allow document embedding for search"
            checked={flags.enableDocEmbedding}
            onCheckedChange={value =>
              setFlags(prev => ({ ...prev, enableDocEmbedding: value }))
            }
          />
        </div>

        <div className="border rounded-md p-3 space-y-3">
          <div className="text-sm font-medium">Features</div>
          <FeatureToggleList
            features={serverConfig.availableWorkspaceFeatures ?? []}
            selected={featureSelection}
            onChange={handleFeaturesChange}
            className="grid grid-cols-1 gap-2"
            control="checkbox"
            controlPosition="left"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Snapshot Size"
            value={formatBytes(workspace.snapshotSize)}
          />
          <MetricCard
            label="Snapshot Count"
            value={`${workspace.snapshotCount}`}
          />
          <MetricCard
            label="Blob Size"
            value={formatBytes(workspace.blobSize)}
          />
          <MetricCard label="Blob Count" value={`${workspace.blobCount}`} />
          <MetricCard label="Members" value={`${workspace.memberCount}`} />
          <MetricCard
            label="Shared Pages"
            value={`${workspace.publicPageCount}`}
          />
        </div>

        <div className="border rounded-md">
          <div className="px-3 py-2 text-sm font-medium">Members</div>
          <Separator />
          <div className="flex flex-col divide-y">
            {memberList.length === 0 ? (
              <div
                className="px-3 py-3 text-xs"
                style={{ color: cssVarV2('text/secondary') }}
              >
                No members.
              </div>
            ) : (
              memberList.map(member => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={member.avatarUrl ?? undefined} />
                    <AvatarFallback>
                      <AccountIcon fontSize={16} />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col overflow-hidden">
                    <div className="text-sm font-medium truncate">
                      {member.name || member.email}
                    </div>
                    <div
                      className="text-xs truncate"
                      style={{ color: cssVarV2('text/secondary') }}
                    >
                      {member.email}
                    </div>
                  </div>
                  <div className="ml-auto text-xs px-2 py-1 rounded border">
                    {member.role}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlagItem({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 p-3">
      <div className="flex flex-col">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs" style={{ color: cssVarV2('text/secondary') }}>
          {description}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-3 flex flex-col gap-1">
      <div className="text-xs" style={{ color: cssVarV2('text/secondary') }}>
        {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
