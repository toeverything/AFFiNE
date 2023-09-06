import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, ImportIcon, PageIcon } from '@blocksuite/icons';
import { Menu } from '@toeverything/components/menu';
import { useState } from 'react';

import { BlockCard } from '../../card/block-card';
import { DropdownButton } from './dropdown';
import { menuContent } from './dropdown.css';

type NewPageButtonProps = {
  createNewPage: () => void;
  createNewEdgeless: () => void;
  importFile: () => void;
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
}: NewPageButtonProps) => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  return (
    <Menu
      items={
        <CreateNewPagePopup
          createNewPage={() => {
            createNewPage();
            setOpen(false);
          }}
          createNewEdgeless={() => {
            createNewEdgeless();
            setOpen(false);
          }}
          importFile={() => {
            importFile();
            setOpen(false);
          }}
        />
      }
      rootOptions={{
        open,
      }}
      contentOptions={{
        className: menuContent,
        align: 'end',
        hideWhenDetached: true,
        onInteractOutside: () => {
          setOpen(false);
        },
      }}
    >
      <DropdownButton
        onClick={() => {
          createNewPage();
          setOpen(false);
        }}
        onClickDropDown={() => setOpen(!open)}
      >
        {t['New Page']()}
      </DropdownButton>
    </Menu>
  );
};
