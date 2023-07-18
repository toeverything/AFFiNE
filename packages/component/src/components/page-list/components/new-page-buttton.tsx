import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, ImportIcon, PageIcon } from '@blocksuite/icons';
import { useState } from 'react';

import { DropdownButton } from '../../../ui/button/dropdown';
import { Menu } from '../../../ui/menu/menu';
import { BlockCard } from '../../card/block-card';

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
      />
      <BlockCard
        title={t['com.affine.new_edgeless']()}
        desc={t['com.affine.draw_with_a_blank_whiteboard']()}
        right={<EdgelessIcon width={20} height={20} />}
        onClick={createNewEdgeless}
      />
      <BlockCard
        title={t['com.affine.new_import']()}
        desc={t['com.affine.import_file']()}
        right={<ImportIcon width={20} height={20} />}
        onClick={importFile}
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
      visible={open}
      placement="bottom-end"
      trigger={['click']}
      disablePortal={true}
      onClickAway={() => {
        setOpen(false);
      }}
      menuStyles={{
        padding: '0px',
        background: 'var(--affine-background-overlay-panel-color)',
      }}
      content={
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
