import { PermissionType, WorkspaceType } from '@affine/workspace/affine/api';
import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import type { Page } from '@blocksuite/store';
import { expect } from '@storybook/jest';
import type { StoryFn } from '@storybook/react';

import { ShareMenu } from '../components/share-menu';
import toast from '../ui/toast/toast';

export default {
  title: 'AFFiNE/ShareMenu',
  component: ShareMenu,
};

function initPage(page: Page): void {
  // Add page block and surface block at root level
  const pageBlockId = page.addBlock('affine:page', {
    title: new page.Text('Hello, world!'),
  });
  page.addBlock('affine:surface', {}, null);
  const frameId = page.addBlock('affine:frame', {}, pageBlockId);
  page.addBlock(
    'affine:paragraph',
    {
      text: new page.Text('This is a paragraph.'),
    },
    frameId
  );
  page.resetHistory();
}

const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace('test-workspace');

initPage(blockSuiteWorkspace.createPage('page0'));
initPage(blockSuiteWorkspace.createPage('page1'));
initPage(blockSuiteWorkspace.createPage('page2'));

const localWorkspace: LocalWorkspace = {
  id: 'test-workspace',
  flavour: WorkspaceFlavour.LOCAL,
  blockSuiteWorkspace,
  providers: [],
};

const affineWorkspace: AffineWorkspace = {
  id: 'test-workspace',
  flavour: WorkspaceFlavour.AFFINE,
  blockSuiteWorkspace,
  providers: [],
  public: false,
  type: WorkspaceType.Normal,
  permission: PermissionType.Owner,
};

async function unimplemented() {
  toast('work in progress');
}

export const Basic: StoryFn = () => {
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
