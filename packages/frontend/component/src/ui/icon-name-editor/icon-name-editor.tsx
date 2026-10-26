import clsx from 'clsx';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { Button, type ButtonProps } from '../button';
import { type IconData, IconPicker, IconType } from '../icon-picker';
import { IconRenderer } from '../icon-picker/renderer';
import Input from '../input';
import { Menu, type MenuProps } from '../menu';
import * as styles from './icon-name-editor.css';

export interface IconEditorProps {
  icon?: IconData | Blob;
  /** Resolved object URL for a persisted blob icon (provided by @affine/core). */
  iconUrl?: string;
  closeAfterSelect?: boolean;
  iconPlaceholder?: ReactNode;
  /** A raw `Blob` means a custom image to upload to the blob engine. */
  onIconChange?: (data?: IconData | Blob) => void;
  triggerClassName?: string;
}

export interface IconAndNameEditorContentProps extends IconEditorProps {
  name: string;
  namePlaceholder?: string;
  onNameChange?: (name: string) => void;
  onEnter?: () => void;
  inputTestId?: string;
}

export interface IconAndNameEditorMenuProps
  extends Omit<MenuProps, 'items'>, IconAndNameEditorContentProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;

  width?: string | number;
  skipIfNotChanged?: boolean;
}

/** Create an object URL for an in-memory blob (pending-selection preview). */
function useBlobPreviewUrl(blob?: Blob): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

export const IconEditor = ({
  icon,
  iconUrl,
  closeAfterSelect,
  iconPlaceholder,
  triggerClassName,
  onIconChange,
  alignOffset,
  sideOffset = 4,
  triggerVariant,
}: IconEditorProps & {
  alignOffset?: number;
  sideOffset?: number;
  triggerVariant?: ButtonProps['variant'];
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pendingPreviewUrl = useBlobPreviewUrl(
    icon instanceof Blob ? icon : undefined
  );

  const handleSelect = useCallback(
    (data?: IconData | Blob) => {
      onIconChange?.(data);
      if (closeAfterSelect) {
        setIsPickerOpen(false);
      }
    },
    [closeAfterSelect, onIconChange]
  );

  const iconType = icon instanceof Blob ? IconType.Blob : icon?.type;

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
          <IconPicker onSelect={handleSelect} />
        </div>
      }
    >
      <Button
        variant={triggerVariant}
        className={clsx(styles.iconPicker, triggerClassName)}
        data-icon-type={iconType}
        aria-label={icon ? 'Change Icon' : 'Select Icon'}
        title={icon ? 'Change Icon' : 'Select Icon'}
        contentClassName={styles.iconContent}
      >
        {icon instanceof Blob ? (
          pendingPreviewUrl ? (
            <img src={pendingPreviewUrl} alt="" className={styles.iconImage} />
          ) : null
        ) : icon?.type === IconType.Blob && iconUrl ? (
          <img src={iconUrl} alt="" className={styles.iconImage} />
        ) : (
          <IconRenderer data={icon} fallback={iconPlaceholder} />
        )}
      </Button>
    </Menu>
  );
};

export const IconAndNameEditorContent = ({
  name,
  namePlaceholder,
  inputTestId,
  onNameChange,
  onEnter,
  ...iconEditorProps
}: IconAndNameEditorContentProps) => {
  return (
    <div className={styles.contentRoot}>
      <IconEditor
        {...iconEditorProps}
        alignOffset={-4}
        sideOffset={8}
        triggerClassName={styles.iconNamePickerIcon}
      />
      <Input
        placeholder={namePlaceholder}
        value={name}
        onChange={onNameChange}
        onEnter={onEnter}
        className={styles.input}
        autoSelect
        autoFocus
        data-testid={inputTestId}
      />
    </div>
  );
};

export const IconAndNameEditorMenu = ({
  open,
  onOpenChange,
  width = 300,
  icon: initialIcon,
  name: initialName,
  onIconChange,
  onNameChange,
  contentOptions,
  iconPlaceholder,
  iconUrl,
  skipIfNotChanged = true,
  inputTestId,
  closeAfterSelect,
  ...menuProps
}: IconAndNameEditorMenuProps) => {
  const [icon, setIcon] = useState<IconData | Blob | undefined>(initialIcon);
  const [name, setName] = useState(initialName);

  const commit = useCallback(() => {
    if (icon !== initialIcon) {
      onIconChange?.(icon);
    }
    if (skipIfNotChanged) {
      if (name !== initialName) onNameChange?.(name);
    } else {
      onNameChange?.(name);
    }
  }, [
    icon,
    initialIcon,
    initialName,
    name,
    onIconChange,
    onNameChange,
    skipIfNotChanged,
  ]);

  const abort = useCallback(() => {
    setIcon(initialIcon);
    setName(initialName);
  }, [initialIcon, initialName]);

  const handleIconChange = useCallback((data?: IconData | Blob) => {
    setIcon(data);
  }, []);

  const handleNameChange = useCallback((name: string) => {
    setName(name);
  }, []);

  const handleMenuOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setIcon(initialIcon);
        setName(initialName);
      }
      onOpenChange?.(open);
    },
    [initialIcon, initialName, onOpenChange]
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
        ...contentOptions,
        className: clsx(styles.menuContent, contentOptions?.className),
      }}
      {...menuProps}
      items={
        <IconAndNameEditorContent
          icon={icon}
          name={name}
          iconPlaceholder={iconPlaceholder}
          closeAfterSelect={closeAfterSelect}
          onIconChange={handleIconChange}
          onNameChange={handleNameChange}
          inputTestId={inputTestId}
          iconUrl={iconUrl}
          onEnter={() => {
            commit();
            onOpenChange?.(false);
          }}
        />
      }
    />
  );
};
