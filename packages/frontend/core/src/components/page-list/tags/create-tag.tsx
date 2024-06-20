import { Button, Input, Menu, toast } from '@affine/component';
import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { tagColors } from '../../affine/page-properties/common';
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

const randomTagColor = () => {
  const randomIndex = Math.floor(Math.random() * tagColors.length);
  return tagColors[randomIndex][1];
};

export const CreateOrEditTag = ({
  open,
  onOpenChange,
  tagMeta,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagMeta?: TagMeta;
}) => {
  const tagList = useService(TagService).tagList;
  const tagOptions = useLiveData(tagList.tagMetas$);
  const tag = useLiveData(tagList.tagByTagId$(tagMeta?.id));
  const t = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);

  const [tagName, setTagName] = useState(tagMeta?.title || '');
  const handleChangeName = useCallback((value: string) => {
    setTagName(value);
  }, []);

  const [tagIcon, setTagIcon] = useState(tagMeta?.color || randomTagColor());

  const handleChangeIcon = useCallback((value: string) => {
    setTagIcon(value);
  }, []);

  const tags = useMemo(() => {
    return tagColors.map(([_, color]) => {
      return {
        name: name,
        color: color,
        onClick: () => {
          handleChangeIcon(color);
          setMenuOpen(false);
        },
      };
    });
  }, [handleChangeIcon]);

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
      handleChangeIcon(randomTagColor());
      setTagName('');
    }
    onOpenChange(false);
  }, [handleChangeIcon, onOpenChange, tagMeta]);

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
    setTagIcon(tagMeta?.color || randomTagColor());
  }, [tagMeta?.color, tagMeta?.title]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.createTagWrapper} data-show={open}>
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
      />
      <Button className={styles.cancelBtn} onClick={onClose}>
        {t['Cancel']()}
      </Button>
      <Button type="primary" onClick={onConfirm} disabled={!tagName}>
        {tagMeta ? t['Save']() : t['Create']()}
      </Button>
    </div>
  );
};
