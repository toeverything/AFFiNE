import { Button, Input, Menu, toast } from '@affine/component';
import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import type { MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { TagMeta } from '../types';
import * as styles from './create-tag.css';

const TagIcon = ({ color, large }: { color: string; large?: boolean }) => (
  <div
    className={clsx(styles.tagColorIcon, {
      ['large']: large,
    })}
    style={{ backgroundColor: color }}
  />
);

export const CreateOrEditTag = ({
  open,
  onOpenChange,
  tagMeta,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagMeta?: TagMeta;
}) => {
  const tagService = useService(TagService);
  const tagList = tagService.tagList;
  const tagOptions = useLiveData(tagList.tagMetas$);
  const tag = useLiveData(tagList.tagByTagId$(tagMeta?.id));
  const t = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  const [tagName, setTagName] = useState(tagMeta?.title || '');
  const handleChangeName = useCallback((value: string) => {
    setTagName(value);
  }, []);

  const [tagIcon, setTagIcon] = useState(
    tagMeta?.color || tagService.randomTagColor()
  );

  const handleChangeIcon = useCallback((value: string) => {
    setTagIcon(value);
  }, []);

  const tags = useMemo(() => {
    return tagService.tagColors.map(([name, color]) => {
      return {
        name: name,
        color: color,
        onClick: () => {
          handleChangeIcon(color);
          setMenuOpen(false);
        },
      };
    });
  }, [handleChangeIcon, tagService.tagColors]);

  const items = useMemo(() => {
    const tagItems = tags.map(item => {
      return (
        <div
          key={item.color}
          onClick={item.onClick}
          className={clsx(styles.tagItem, {
            ['active']: item.color === tagIcon,
          })}
        >
          <TagIcon color={item.color} large={true} />
        </div>
      );
    });
    return <div className={styles.tagItemsWrapper}>{tagItems}</div>;
  }, [tagIcon, tags]);

  const onClose = useCallback(() => {
    if (!tagMeta) {
      handleChangeIcon(tagService.randomTagColor());
      setTagName('');
    }
    onOpenChange(false);
  }, [handleChangeIcon, onOpenChange, tagMeta, tagService]);

  const onConfirm = useCallback(() => {
    if (!tagName?.trim()) return;
    if (
      tagOptions.some(
        tag => tag.title === tagName.trim() && tag.id !== tagMeta?.id
      )
    ) {
      return toast(t['com.affine.tags.create-tag.toast.exist']());
    }
    if (!tagMeta) {
      tagList.createTag(tagName.trim(), tagIcon);
      toast(t['com.affine.tags.create-tag.toast.success']());
      onClose();
      return;
    }
    tag?.rename(tagName.trim());
    tag?.changeColor(tagIcon);

    toast(t['com.affine.tags.edit-tag.toast.success']());
    onClose();
    return;
  }, [onClose, t, tag, tagIcon, tagMeta, tagName, tagOptions, tagList]);

  const handlePropagation = useCallback((event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useEffect(() => {
    if (!open) return;
    if (menuOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, onOpenChange, menuOpen, onClose]);

  useEffect(() => {
    setTagName(tagMeta?.title || '');
    setTagIcon(tagMeta?.color || tagService.randomTagColor());
  }, [tagMeta?.color, tagMeta?.title, tagService]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={styles.createTagWrapper}
      data-show={open}
      data-testid="edit-tag-modal"
      onClick={handlePropagation}
    >
      <Menu
        rootOptions={{
          open: menuOpen,
          onOpenChange: setMenuOpen,
        }}
        items={items}
      >
        <Button className={styles.menuBtn}>
          <TagIcon color={tagIcon} />
        </Button>
      </Menu>

      <Input
        placeholder={t['com.affine.tags.create-tag.placeholder']()}
        inputStyle={{ fontSize: 'var(--affine-font-xs)' }}
        onEnter={onConfirm}
        value={tagName}
        onChange={handleChangeName}
        autoFocus
        data-testid="edit-tag-input"
      />
      <Button className={styles.cancelBtn} onClick={onClose}>
        {t['Cancel']()}
      </Button>
      <Button
        variant="primary"
        onClick={onConfirm}
        disabled={!tagName}
        data-testid="save-tag"
      >
        {tagMeta ? t['Save']() : t['Create']()}
      </Button>
    </div>
  );
};
