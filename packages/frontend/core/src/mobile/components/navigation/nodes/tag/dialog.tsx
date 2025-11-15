import { type MenuSubProps, useMobileMenuController } from '@affine/component';
import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import { RenameContent, RenameSubMenu } from '../../../rename';
import { RenameDialog } from '../../../rename/dialog';
import type { RenameContentProps } from '../../../rename/type';
import * as styles from './dialog.css';

const TagColorContext = createContext<{
  colors: string[];
  color: string;
  setColor: Dispatch<SetStateAction<string>>;
  show: boolean;
  setShow: Dispatch<SetStateAction<boolean>>;
  enableAnimation?: boolean;
}>({
  color: '',
  setColor: () => {},
  colors: [],
  show: false,
  setShow: () => {},
});

const ColorPickerTrigger = () => {
  const { color, show, setShow } = useContext(TagColorContext);
  return (
    <div
      data-testid="tag-color-picker-trigger"
      className={styles.colorTrigger}
      style={{ color }}
      data-active={show}
      onClick={() => setShow(prev => !prev)}
    />
  );
};

const ColorPickerSelect = () => {
  const {
    enableAnimation,
    colors,
    color: current,
    setColor,
    show,
  } = useContext(TagColorContext);

  if (!show && !enableAnimation) return null;

  return (
    <div
      data-testid="tag-color-picker-select"
      className={styles.colorsRow}
      data-active={show}
      data-enable-fold={enableAnimation || undefined}
    >
      {colors.map(color => (
        <div
          key={color}
          aria-checked={color === current}
          onClick={() => setColor(color)}
          className={styles.colorDot}
          style={{ color }}
          data-color={color}
        />
      ))}
    </div>
  );
};

interface TagRenameContentProps extends Omit<RenameContentProps, 'onConfirm'> {
  initialColor?: string;
  onConfirm?: (name: string, color: string) => void;
  enableAnimation?: boolean;
}
const TagRenameContent = ({
  initialColor,
  onConfirm,
  enableAnimation,
  ...props
}: TagRenameContentProps) => {
  const tagService = useService(TagService);
  const colors = useMemo(() => {
    return tagService.tagColors.map(([_, value]) => value);
  }, [tagService.tagColors]);

  const [color, setColor] = useState(
    initialColor || tagService.randomTagColor()
  );
  const [show, setShow] = useState(false);

  const handleConfirm = useCallback(
    (name: string) => {
      onConfirm?.(name, color);
    },
    [color, onConfirm]
  );

  return (
    <TagColorContext.Provider
      value={{ colors, color, setColor, show, setShow, enableAnimation }}
    >
      <RenameContent
        inputPrefixRenderer={ColorPickerTrigger}
        inputBelowRenderer={ColorPickerSelect}
        onConfirm={handleConfirm}
        {...props}
      />
    </TagColorContext.Provider>
  );
};

interface TagRenameDialogProps extends TagRenameContentProps {
  title?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
export const TagRenameDialog = ({
  title: propsTitle,
  confirmText: propsConfirmText,
  open,
  onOpenChange,
  ...props
}: TagRenameDialogProps) => {
  const t = useI18n();
  const title = propsTitle || t['com.affine.m.explorer.tag.new-dialog-title']();
  const confirmText =
    propsConfirmText || t['com.affine.m.explorer.tag.rename-confirm']();

  return (
    <RenameDialog
      open={open}
      onOpenChange={onOpenChange}
      inputPrefixRenderer={ColorPickerTrigger}
      title={title}
      confirmText={confirmText}
    >
      <TagRenameContent {...props} />
    </RenameDialog>
  );
};

interface TagRenameSubMenuProps {
  tagId?: string;
  title?: string;
  icon?: ReactNode;
  text?: string;
  onConfirm?: (name: string, color: string) => void;
  menuProps?: Partial<MenuSubProps>;
}
export const TagRenameSubMenu = ({
  tagId,
  title,
  icon,
  text,
  menuProps,
  onConfirm,
}: TagRenameSubMenuProps) => {
  const t = useI18n();
  const { close } = useMobileMenuController();
  const tagService = useService(TagService);
  const tagRecord = useLiveData(tagService.tagList.tagByTagId$(tagId));
  const tagName = useLiveData(tagRecord?.value$);
  const tagColor = useLiveData(tagRecord?.color$);

  const handleCloseAndConfirm = useCallback(
    (name: string, color: string) => {
      close();
      onConfirm?.(name, color);
    },
    [close, onConfirm]
  );

  return (
    <RenameSubMenu
      title={title ?? t['com.affine.m.explorer.tag.rename-menu-title']()}
      icon={icon}
      text={text}
      menuProps={menuProps}
    >
      <TagRenameContent
        initialName={tagName}
        initialColor={tagColor}
        onConfirm={handleCloseAndConfirm}
      />
    </RenameSubMenu>
  );
};
