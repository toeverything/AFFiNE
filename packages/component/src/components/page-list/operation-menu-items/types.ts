import type { HTMLAttributes } from 'react';

export type CommonMenuItemProps<SelectParams = undefined> = {
  // onItemClick is triggered when the item is clicked, sometimes after item click, it still has some internal logic to run(like popover a new menu), so we need to have a separate callback for that
  onItemClick?: () => void;
  // onSelect is triggered when the item is selected, it's the final callback for the item click
  onSelect?: (params?: SelectParams) => void;
} & HTMLAttributes<HTMLButtonElement>;
