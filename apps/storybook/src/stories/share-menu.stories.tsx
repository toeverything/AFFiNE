import { toast } from '@affine/component';
import {
  PublicLinkDisableModal,
  StyledDisableButton,
} from '@affine/component/share-menu';
import { ShareMenu } from '@affine/component/share-menu';
import type {
  AffineLegacyCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  PermissionType,
  WorkspaceType,
} from '@affine/env/workspace/legacy-cloud';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import type { Page } from '@blocksuite/store';
import { expect } from '@storybook/jest';
import type { StoryFn } from '@storybook/react';
import { use, useState } from 'react';

export default {
  title: 'AFFiNE/ShareMenu',
  component: ShareMenu,
};

async function initPage(page: Page) {
  await page.waitForLoaded();
  // Add page block and surface block at root level
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text('Hello, world!'),
  });
  page.addBlock('affine:surface', {}, pageBlockId);
  const frameId = page.addBlock('affine:note', {}, pageBlockId);
  page.addBlock(
    'affine:paragraph',
    {
      text: new page.Text('This is a paragraph.'),
    },
    frameId
  );
  page.resetHistory();
}

const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
  'test-workspace',
  WorkspaceFlavour.LOCAL
);

const promise = Promise.all([
  initPage(blockSuiteWorkspace.createPage({ id: 'page0' })),
  initPage(blockSuiteWorkspace.createPage({ id: 'page1' })),
  initPage(blockSuiteWorkspace.createPage({ id: 'page2' })),
]);

const localWorkspace: LocalWorkspace = {
  id: 'test-workspace',
  flavour: WorkspaceFlavour.LOCAL,
  blockSuiteWorkspace,
};

const affineWorkspace: AffineLegacyCloudWorkspace = {
  id: 'test-workspace',
  flavour: WorkspaceFlavour.AFFINE,
  blockSuiteWorkspace,
  public: false,
  type: WorkspaceType.Normal,
  permission: PermissionType.Owner,
};

async function unimplemented() {
  toast('work in progress');
}

export const Basic: StoryFn = () => {
  use(promise);
  return (
    <ShareMenu
      currentPage={blockSuiteWorkspace.getPage('page0') as Page}
      workspace={localWorkspace}
      onEnableAffineCloud={unimplemented}
      onOpenWorkspaceSettings={unimplemented}
      togglePagePublic={unimplemented}
      toggleWorkspacePublish={unimplemented}
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
  await new Promise(resolve => setTimeout(resolve, 100));
  {
    const button = canvasElement.querySelector(
      '[data-testid="share-menu-enable-affine-cloud-button"]'
    );
    expect(button).not.toBeNull();
  }
};

export const AffineBasic: StoryFn = () => {
  use(promise);
  return (
    <ShareMenu
      currentPage={blockSuiteWorkspace.getPage('page0') as Page}
      workspace={affineWorkspace}
      onEnableAffineCloud={unimplemented}
      onOpenWorkspaceSettings={unimplemented}
      togglePagePublic={unimplemented}
      toggleWorkspacePublish={unimplemented}
    />
  );
};

export const DisableModal: StoryFn = () => {
  const [open, setOpen] = useState(false);
  use(promise);
  return (
    <>
      <StyledDisableButton onClick={() => setOpen(!open)}>
        Disable Public Link
      </StyledDisableButton>
      <PublicLinkDisableModal
        open={open}
        onConfirmDisable={() => {
          toast('Disabled');
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
};
