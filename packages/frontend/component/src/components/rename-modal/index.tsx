import { useCallback, useState } from 'react';

import Input from '../../ui/input';
import { Menu } from '../../ui/menu';

export const RenameModal = ({
  onRename,
  currentName,
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (newName: string) => void;
  currentName: string;
}) => {
  const [value, setValue] = useState(currentName);
  const handleRename = useCallback(() => {
    onRename(value);
    onOpenChange(false);
  }, [onOpenChange, onRename, value]);
  return (
    <Menu
      rootOptions={{
        open: open,
        onOpenChange: onOpenChange,
      }}
      contentOptions={{
        side: 'left',
        onPointerDownOutside: handleRename,
        sideOffset: -12,
      }}
      items={
        <Input
          autoFocus
          width={220}
          style={{ height: 34 }}
          defaultValue={value}
          onChange={setValue}
          onEnter={handleRename}
          data-testid="rename-modal-input"
        />
      }
    >
      <div></div>
    </Menu>
  );
};
