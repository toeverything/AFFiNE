import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, ImportIcon, PageIcon } from '@blocksuite/icons';
import { Menu } from '@toeverything/components/menu';
import { type PropsWithChildren, useCallback, useState } from 'react';

import { DropdownButton } from '../../../ui/button';
import { BlockCard } from '../../card/block-card';
import { menuContent } from './new-page-button.css';

type NewPageButtonProps = {
  createNewPage: () => void;
  createNewEdgeless: () => void;
  importFile: () => void;
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
        title={t['New Page']()}
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
      <BlockCard
        title={t['com.affine.new_import']()}
        desc={t['com.affine.import_file']()}
        right={<ImportIcon width={20} height={20} />}
        onClick={importFile}
        data-testid="import-button-in-all-page"
      />
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
  return (
    <Menu
      items={
        <CreateNewPagePopup
          createNewPage={useCallback(() => {
            createNewPage();
            setOpen(false);
          }, [createNewPage])}
          createNewEdgeless={useCallback(() => {
            createNewEdgeless();
            setOpen(false);
          }, [createNewEdgeless])}
          importFile={useCallback(() => {
            importFile();
            setOpen(false);
          }, [importFile])}
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
        data-testid="new-page-button"
        onClick={useCallback(() => {
          createNewPage();
          setOpen(false);
        }, [createNewPage])}
        onClickDropDown={useCallback(() => setOpen(open => !open), [])}
      >
        {children}
      </DropdownButton>
    </Menu>
  );
};
