import { Menu, type MenuProps, type MenuRef } from '@affine/component';
import { useEffect, useRef } from 'react';

export const FilterValueMenu = ({
  isDraft,
  rootOptions,
  contentOptions,
  onDraftCompleted,
  ...otherProps
}: { isDraft?: boolean; onDraftCompleted?: () => void } & MenuProps) => {
  const menuRef = useRef<MenuRef>(null);

  useEffect(() => {
    if (isDraft) {
      menuRef.current?.changeOpen(true);
    }
  }, [isDraft]);

  return (
    <Menu
      ref={menuRef}
      rootOptions={{
        onClose: onDraftCompleted,
        ...rootOptions,
      }}
      contentOptions={{
        alignOffset: -4,
        ...contentOptions,
      }}
      {...otherProps}
    />
  );
};
