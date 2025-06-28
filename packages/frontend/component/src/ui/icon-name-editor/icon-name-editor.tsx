import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import clsx from 'clsx';
import { useTheme } from 'next-themes';
import { type ReactNode, useCallback, useState } from 'react';

import { Button } from '../button';
import Input from '../input';
import { Menu, type MenuProps } from '../menu';
import * as styles from './icon-name-editor.css';

export type IconType = 'emoji' | 'affine-icon' | 'blob';

export interface IconEditorProps {
  iconType: IconType;
  icon: string;
  closeAfterSelect?: boolean;
  iconPlaceholder?: ReactNode;
  onIconChange?: (type: IconType, icon: string) => void;
  triggerClassName?: string;
}

export interface IconAndNameEditorContentProps extends IconEditorProps {
  name: string;
  namePlaceholder?: string;
  onNameChange?: (name: string) => void;
}

export interface IconAndNameEditorMenuProps
  extends Omit<MenuProps, 'items'>,
    IconAndNameEditorContentProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;

  width?: string | number;
}

const IconRenderer = ({
  iconType,
  icon,
}: {
  iconType: IconType;
  icon: string;
}) => {
  switch (iconType) {
    case 'emoji':
      return <div>{icon}</div>;
    default:
      throw new Error(`Unsupported icon type: ${iconType}`);
  }
};

export const IconEditor = ({
  iconType,
  icon,
  closeAfterSelect,
  iconPlaceholder,
  triggerClassName,
  onIconChange,
  alignOffset,
  sideOffset = 4,
}: IconEditorProps & {
  alignOffset?: number;
  sideOffset?: number;
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const handleEmojiClick = useCallback(
    (emoji: any) => {
      onIconChange?.('emoji', emoji.native);
      if (closeAfterSelect) {
        setIsPickerOpen(false);
      }
    },
    [closeAfterSelect, onIconChange]
  );
  return (
    <Menu
      rootOptions={{
        open: isPickerOpen,
        onOpenChange: setIsPickerOpen,
        modal: true,
      }}
      contentOptions={{
        side: 'bottom',
        sideOffset,
        align: 'start',
        alignOffset,
        className: styles.emojiPickerPopover,
      }}
      items={
        <div onWheel={e => e.stopPropagation()}>
          <Picker
            data={data}
            theme={resolvedTheme}
            onEmojiSelect={handleEmojiClick}
          />
        </div>
      }
    >
      <Button
        className={clsx(styles.iconPicker, triggerClassName)}
        data-icon-type={iconType}
      >
        {icon ? (
          <IconRenderer iconType={iconType} icon={icon} />
        ) : (
          iconPlaceholder
        )}
      </Button>
    </Menu>
  );
};

export const IconAndNameEditorContent = ({
  name,
  namePlaceholder,
  onNameChange,
  ...iconEditorProps
}: IconAndNameEditorContentProps) => {
  return (
    <div className={styles.contentRoot}>
      <IconEditor {...iconEditorProps} alignOffset={-4} sideOffset={8} />
      <Input
        placeholder={namePlaceholder}
        value={name}
        onChange={onNameChange}
        className={styles.input}
      />
    </div>
  );
};

export const IconAndNameEditorMenu = ({
  open,
  onOpenChange,
  width = 300,
  iconType: initialIconType,
  icon: initialIcon,
  name: initialName,
  onIconChange,
  onNameChange,
  ...menuProps
}: IconAndNameEditorMenuProps) => {
  const [iconType, setIconType] = useState(initialIconType);
  const [icon, setIcon] = useState(initialIcon);
  const [name, setName] = useState(initialName);

  const commit = useCallback(() => {
    if (iconType !== initialIconType || icon !== initialIcon) {
      onIconChange?.(iconType, icon);
    }
    if (name !== initialName) {
      onNameChange?.(name);
    }
  }, [
    icon,
    iconType,
    initialIcon,
    initialIconType,
    initialName,
    name,
    onIconChange,
    onNameChange,
  ]);
  const abort = useCallback(() => {
    setIconType(initialIconType);
    setIcon(initialIcon);
    setName(initialName);
  }, [initialIcon, initialIconType, initialName]);
  const handleIconChange = useCallback((type: IconType, icon: string) => {
    setIconType(type);
    setIcon(icon);
  }, []);
  const handleNameChange = useCallback((name: string) => {
    setName(name);
  }, []);
  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setIconType(initialIconType);
        setIcon(initialIcon);
        setName(initialName);
      }
      onOpenChange?.(open);
    },
    [initialIcon, initialIconType, initialName, onOpenChange]
  );

  return (
    <Menu
      rootOptions={{
        modal: true,
        open,
        onOpenChange: handleMenuOpenChange,
        ...menuProps.rootOptions,
      }}
      contentOptions={{
        side: 'bottom',
        sideOffset: 4,
        align: 'start',

        onClick: e => e.stopPropagation(),
        role: 'rename-modal',
        style: { width },
        onPointerDownOutside: commit,
        onEscapeKeyDown: abort,
        ...menuProps.contentOptions,
        className: clsx(
          styles.menuContent,
          menuProps.contentOptions?.className
        ),
      }}
      {...menuProps}
      items={
        <IconAndNameEditorContent
          iconType={iconType}
          icon={icon}
          name={name}
          onIconChange={handleIconChange}
          onNameChange={handleNameChange}
        />
      }
    />
  );
};
