import { DropdownButton, Menu } from '@affine/component';
import { BlockCard } from '@affine/component/card/block-card';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { EdgelessIcon, ImportIcon, PageIcon } from '@blocksuite/icons/rc';
import type { MouseEvent, PropsWithChildren } from 'react';
import { useCallback, useState } from 'react';

import { menuContent } from './new-page-button.css';

type NewPageButtonProps = {
  createNewDoc: (e?: MouseEvent) => void;
  createNewPage: (e?: MouseEvent) => void;
  createNewEdgeless: (e?: MouseEvent) => void;
  importFile?: () => void;
  size?: 'small' | 'default';
};

export const CreateNewPagePopup = ({
  createNewPage,
  createNewEdgeless,
  importFile,
}: NewPageButtonProps) => {
  const t = useI18n();
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
        onAuxClick={createNewPage}
        data-testid="new-page-button-in-all-page"
      />
      <BlockCard
        title={t['com.affine.new_edgeless']()}
        desc={t['com.affine.draw_with_a_blank_whiteboard']()}
        right={<EdgelessIcon width={20} height={20} />}
        onClick={createNewEdgeless}
        onAuxClick={createNewEdgeless}
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
  createNewDoc,
  createNewPage,
  createNewEdgeless,
  importFile,
  size,
  children,
}: PropsWithChildren<NewPageButtonProps>) => {
  const [open, setOpen] = useState(false);

  const handleCreateNewDoc: NewPageButtonProps['createNewDoc'] = useCallback(
    e => {
      createNewDoc(e);
      setOpen(false);
      track.allDocs.header.actions.createDoc();
    },
    [createNewDoc]
  );

  const handleCreateNewPage: NewPageButtonProps['createNewPage'] = useCallback(
    e => {
      createNewPage(e);
      setOpen(false);
      track.allDocs.header.actions.createDoc({ mode: 'page' });
    },
    [createNewPage]
  );

  const handleCreateNewEdgeless: NewPageButtonProps['createNewEdgeless'] =
    useCallback(
      e => {
        createNewEdgeless(e);
        setOpen(false);
        track.allDocs.header.actions.createDoc({
          mode: 'edgeless',
        });
      },
      [createNewEdgeless]
    );

  const handleImportFile = useCallback(() => {
    importFile?.();
    setOpen(false);
  }, [importFile]);

  return (
    <Menu
      items={
        <CreateNewPagePopup
          createNewDoc={handleCreateNewDoc}
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
        onClick={handleCreateNewDoc}
        onAuxClick={handleCreateNewPage}
        onClickDropDown={useCallback(() => setOpen(open => !open), [])}
      >
        {children}
      </DropdownButton>
    </Menu>
  );
};
