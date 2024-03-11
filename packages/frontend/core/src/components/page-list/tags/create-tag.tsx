import { Button, Input, Menu, toast } from '@affine/component';
import { WorkspaceLegacyProperties } from '@affine/core/modules/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { nanoid } from 'nanoid';
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
  return tagColors[randomIndex];
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
  const legacyProperties = useService(WorkspaceLegacyProperties);
  const tagOptions = useLiveData(legacyProperties.tagOptions$);
  const t = useAFFiNEI18N();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tagName, setTagName] = useState(tagMeta?.title || '');
  const [activeTagIcon, setActiveTagIcon] = useState(() => {
    return (
      tagColors.find(([_, color]) => color === tagMeta?.color) ||
      randomTagColor()
    );
  });

  const tags = useMemo(() => {
    return tagColors.map(([name, color]) => {
      return {
        name: name,
        color: color,
        onClick: () => {
          setActiveTagIcon([name, color]);
          setMenuOpen(false);
        },
      };
    });
  }, []);

  const items = useMemo(() => {
    const tagItems = tags.map(item => {
      return (
        <div
          key={item.name}
          onClick={item.onClick}
          className={clsx(styles.tagItem, {
            ['active']: item.name === activeTagIcon[0],
          })}
        >
          <TagIcon color={item.color} large={true} />
        </div>
      );
    });
    return <div className={styles.tagItemsWrapper}>{tagItems}</div>;
  }, [activeTagIcon, tags]);

  const onClose = useCallback(() => {
    if (!tagMeta) {
      setActiveTagIcon(randomTagColor);
      setTagName('');
    }
    onOpenChange(false);
  }, [onOpenChange, tagMeta]);

  const onConfirm = useCallback(() => {
    if (!tagName.trim()) return;
    if (tagOptions.some(tag => tag.value === tagName.trim()) && !tagMeta) {
      return toast(t['com.affine.tags.create-tag.toast.exist']());
    }
    if (!tagMeta) {
      const newTag = {
        id: nanoid(),
        value: tagName.trim(),
        color: activeTagIcon[1] || tagColors[0][1],
      };

      legacyProperties.updateTagOptions([...tagOptions, newTag]);
      toast(t['com.affine.tags.create-tag.toast.success']());
      onClose();
      return;
    }

    const updatedTag = {
      id: tagMeta.id,
      value: tagName.trim(),
      color: activeTagIcon[1] || tagColors[0][1],
    };
    legacyProperties.updateTagOption(tagMeta.id, updatedTag);
    toast(t['com.affine.tags.edit-tag.toast.success']());
    onClose();
    return;
  }, [
    activeTagIcon,
    legacyProperties,
    onClose,
    t,
    tagMeta,
    tagName,
    tagOptions,
  ]);

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
          <TagIcon color={activeTagIcon[1] || ''} />
        </Button>
      </Menu>

      <Input
        placeholder={t['com.affine.tags.create-tag.placeholder']()}
        inputStyle={{ fontSize: 'var(--affine-font-xs)' }}
        onEnter={onConfirm}
        value={tagName}
        onChange={setTagName}
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
