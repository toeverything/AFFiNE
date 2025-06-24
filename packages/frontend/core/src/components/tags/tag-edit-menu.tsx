import {
  Input,
  Menu,
  MenuItem,
  type MenuProps,
  MenuSeparator,
  Scrollable,
} from '@affine/component';
import { useI18n } from '@affine/i18n';
import { DeleteIcon, DoneIcon, TagsIcon } from '@blocksuite/icons/rc';
import type { MouseEventHandler, PropsWithChildren } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ConfigModal } from '../mobile';
import { TagItem } from './tag';
import * as styles from './tag-edit-menu.css';
import type { TagColor, TagLike } from './types';

type TagEditMenuProps = PropsWithChildren<{
  onTagDelete: (tagId: string) => void;
  colors: TagColor[];
  tag: TagLike;
  onTagChange: (property: keyof TagLike, value: string) => void;
  jumpToTag?: (tagId: string) => void;
}>;

const DesktopTagEditMenu = ({
  tag,
  onTagDelete,
  children,
  jumpToTag,
  colors,
  onTagChange,
}: TagEditMenuProps) => {
  const t = useI18n();

  const menuProps = useMemo(() => {
    const updateTagName = (name: string) => {
      if (name.trim() === '') {
        return;
      }
      onTagChange('name', name);
    };

    return {
      contentOptions: {
        onClick(e) {
          e.stopPropagation();
        },
      },
      items: (
        <>
          <Input
            defaultValue={tag.name}
            onBlur={e => {
              updateTagName(e.currentTarget.value);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                updateTagName(e.currentTarget.value);
              }
              e.stopPropagation();
            }}
            placeholder={t['Untitled']()}
          />
          <MenuSeparator />
          <MenuItem
            prefixIcon={<DeleteIcon />}
            type="danger"
            onClick={() => {
              tag?.id ? onTagDelete(tag.id) : null;
            }}
          >
            {t['Delete']()}
          </MenuItem>
          {jumpToTag ? (
            <MenuItem
              prefixIcon={<TagsIcon />}
              onClick={() => {
                jumpToTag(tag.id);
              }}
            >
              {t['com.affine.page-properties.tags.open-tags-page']()}
            </MenuItem>
          ) : null}
          <MenuSeparator />
          <Scrollable.Root>
            <Scrollable.Viewport className={styles.menuItemList}>
              {colors.map(({ name, value: color }) => (
                <MenuItem
                  key={color}
                  checked={tag.color === color}
                  prefixIcon={
                    <div className={styles.tagColorIconWrapper}>
                      <div
                        className={styles.tagColorIcon}
                        style={{
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  }
                  onClick={() => {
                    onTagChange('color', color);
                  }}
                >
                  {name}
                </MenuItem>
              ))}
              <Scrollable.Scrollbar className={styles.menuItemListScrollbar} />
            </Scrollable.Viewport>
          </Scrollable.Root>
        </>
      ),
    } satisfies Partial<MenuProps>;
  }, [tag, t, jumpToTag, colors, onTagChange, onTagDelete]);

  return <Menu {...menuProps}>{children}</Menu>;
};

const MobileTagEditMenu = ({
  tag,
  onTagDelete,
  children,
  colors,
  onTagChange,
}: TagEditMenuProps) => {
  const [open, setOpen] = useState(false);
  const t = useI18n();
  const [localTag, setLocalTag] = useState({ ...tag });

  useEffect(() => {
    if (localTag.name !== tag.name) {
      setLocalTag({ ...tag });
    }
  }, [tag, localTag.name]);

  const handleTriggerClick: MouseEventHandler<HTMLDivElement> = useCallback(
    e => {
      e.stopPropagation();
      setOpen(true);
    },
    []
  );
  const handleOnDone = () => {
    setOpen(false);
    if (localTag.name.trim() !== tag.name) {
      onTagChange('name', localTag.name);
    }
    if (localTag.color !== tag.color) {
      onTagChange('color', localTag.color);
    }
  };
  return (
    <>
      <ConfigModal
        open={open}
        onOpenChange={setOpen}
        title={<TagItem mode="list-tag" tag={tag} />}
        onDone={handleOnDone}
      >
        <Input
          inputStyle={{
            height: 46,
            padding: '12px',
          }}
          autoSelect={false}
          className={styles.mobileTagEditInput}
          value={localTag.name}
          onChange={e => {
            setLocalTag({ ...localTag, name: e });
          }}
          placeholder={t['Untitled']()}
        />

        <ConfigModal.RowGroup title={t['Colors']()}>
          {colors.map(({ name, value: color }) => (
            <ConfigModal.Row
              key={color}
              onClick={() => {
                setLocalTag({ ...localTag, color });
              }}
            >
              <div className={styles.tagColorIconWrapper}>
                <div
                  className={styles.tagColorIcon}
                  style={{
                    backgroundColor: color,
                  }}
                />
              </div>
              {name}
              <div className={styles.spacer} />
              <DoneIcon
                className={styles.tagColorIconSelect}
                data-selected={localTag.color === color}
              />
            </ConfigModal.Row>
          ))}
        </ConfigModal.RowGroup>

        <ConfigModal.RowGroup>
          <ConfigModal.Row
            className={styles.mobileTagEditDeleteRow}
            onClick={() => {
              onTagDelete(tag.id);
            }}
          >
            <DeleteIcon />
            {t['Delete']()}
          </ConfigModal.Row>
        </ConfigModal.RowGroup>
      </ConfigModal>
      <div onClick={handleTriggerClick} className={styles.mobileTagEditTrigger}>
        {children}
      </div>
    </>
  );
};

export const TagEditMenu = BUILD_CONFIG.isMobileEdition
  ? MobileTagEditMenu
  : DesktopTagEditMenu;
