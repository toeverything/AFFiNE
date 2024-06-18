import { DropdownButton, Menu } from '@affine/component';
import { BlockCard } from '@affine/component/card/block-card';
import { mixpanel } from '@affine/core/utils';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, ImportIcon, PageIcon } from '@blocksuite/icons/rc';
import type { PropsWithChildren } from 'react';
import { useCallback, useState } from 'react';

import { menuContent } from './new-page-button.css';

type NewPageButtonProps = {
  createNewPage: () => void;
  createNewEdgeless: () => void;
  importFile?: () => void;
  size?: 'small' | 'default';
};

export const CreateNewPagePopup = ({
  createNewPage,
  createNewEdgeless,
  importFile,
}: NewPageButtonProps) => {
  const t = useAFFiNEI18N();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '8px',
      }}
    >
      <BlockCard
        title={t['com.affine.new.page-mode']()}
        desc={t['com.affine.write_with_a_blank_page']()}
        right={<PageIcon width={20} height={20} />}
        onClick={createNewPage}
        data-testid="new-page-button-in-all-page"
      />
      <BlockCard
        title={t['com.affine.new_edgeless']()}
        desc={t['com.affine.draw_with_a_blank_whiteboard']()}
        right={<EdgelessIcon width={20} height={20} />}
        onClick={createNewEdgeless}
        data-testid="new-edgeless-button-in-all-page"
      />
      {importFile ? (
        <BlockCard
          title={t['com.affine.new_import']()}
          desc={t['com.affine.import_file']()}
          right={<ImportIcon width={20} height={20} />}
          onClick={importFile}
          data-testid="import-button-in-all-page"
        />
      ) : null}
      {/* TODO Import */}
    </div>
  );
};

export const NewPageButton = ({
  createNewPage,
  createNewEdgeless,
  importFile,
  size,
  children,
}: PropsWithChildren<NewPageButtonProps>) => {
  const [open, setOpen] = useState(false);

  const handleCreateNewPage = useCallback(() => {
    createNewPage();
    setOpen(false);
    mixpanel.track('DocCreated', {
      page: 'doc library',
      segment: 'all doc',
      module: 'doc list header',
      control: 'new doc button',
      type: 'doc',
      category: 'page',
    });
  }, [createNewPage]);

  const handleCreateNewEdgeless = useCallback(() => {
    createNewEdgeless();
    setOpen(false);
    mixpanel.track('DocCreated', {
      page: 'doc library',
      segment: 'all doc',
      module: 'doc list header',
      control: 'new whiteboard button',
      type: 'doc',
      category: 'whiteboard',
    });
  }, [createNewEdgeless]);

  const handleImportFile = useCallback(() => {
    importFile?.();
    setOpen(false);
  }, [importFile]);

  return (
    <Menu
      items={
        <CreateNewPagePopup
          createNewPage={handleCreateNewPage}
          createNewEdgeless={handleCreateNewEdgeless}
          importFile={importFile ? handleImportFile : undefined}
        />
      }
      rootOptions={{
        open,
      }}
      contentOptions={{
        className: menuContent,
        align: 'end',
        hideWhenDetached: true,
        onInteractOutside: useCallback(() => {
          setOpen(false);
        }, []),
      }}
    >
      <DropdownButton
        size={size}
        onClick={handleCreateNewPage}
        onClickDropDown={useCallback(() => setOpen(open => !open), [])}
      >
        {children}
      </DropdownButton>
    </Menu>
  );
};
