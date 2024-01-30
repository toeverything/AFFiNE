import { toast } from '@affine/component';
import { PublicLinkDisableModal } from '@affine/component/disable-public-link';
import { ShareMenu } from '@affine/core/components/affine/share-page-modal/share-menu';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { type Page } from '@blocksuite/store';
import { expect } from '@storybook/jest';
import type { Meta, StoryFn } from '@storybook/react';
import { Workspace } from '@toeverything/infra';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import { useService } from '@toeverything/infra/di';
import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';

export default {
  title: 'AFFiNE/ShareMenu',
  component: ShareMenu,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

async function unimplemented() {
  toast('work in progress');
}

export const Basic: StoryFn = () => {
  const workspace = useService(Workspace);

  const [page, setPage] = useState<Page | null>(null);

  useEffect(() => {
    const page = workspace.blockSuiteWorkspace.createPage(nanoid());
    initEmptyPage(page);

    setPage(page);
  }, [workspace]);

  if (!page) {
    return <div></div>;
  }

  return (
    <ShareMenu
      currentPage={page}
      workspaceMetadata={workspace}
      onEnableAffineCloud={unimplemented}
    />
  );
};

Basic.play = async ({ canvasElement }) => {
  {
    const button = canvasElement.querySelector(
      '[data-testid="share-menu-button"]'
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
  }
  await new Promise(resolve => window.setTimeout(resolve, 100));
  {
    const button = canvasElement.querySelector(
      '[data-testid="share-menu-enable-affine-cloud-button"]'
    );
    expect(button).not.toBeNull();
  }
};

export const AffineBasic: StoryFn = () => {
  const workspace = useService(Workspace);

  const [page, setPage] = useState<Page | null>(null);

  useEffect(() => {
    const page = workspace.blockSuiteWorkspace.createPage(nanoid());
    initEmptyPage(page);

    setPage(page);
  }, [workspace]);

  if (!page) {
    return <div></div>;
  }

  return (
    <ShareMenu
      currentPage={page}
      workspaceMetadata={{
        ...workspace.meta,
        flavour: WorkspaceFlavour.AFFINE_CLOUD,
      }}
      onEnableAffineCloud={unimplemented}
    />
  );
};

export const DisableModal: StoryFn = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div onClick={() => setOpen(!open)}>Disable Public Link</div>
      <PublicLinkDisableModal
        open={open}
        onConfirm={() => {
          toast('Disabled');
          setOpen(false);
        }}
        onOpenChange={setOpen}
      />
    </>
  );
};
