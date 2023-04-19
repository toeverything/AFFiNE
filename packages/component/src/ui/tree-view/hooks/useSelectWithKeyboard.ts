import { useEffect, useState } from 'react';

import type { TreeViewProps } from '../types';
import { flattenIds } from '../utils';
export const useSelectWithKeyboard = <RenderProps>({
  data,
  enableKeyboardSelection,
  onSelect,
}: Pick<
  TreeViewProps<RenderProps>,
  'data' | 'enableKeyboardSelection' | 'onSelect'
>) => {
  const [selectedId, setSelectedId] = useState<string>();
  // TODO: should record collapsedIds in localStorage

  useEffect(() => {
    if (!enableKeyboardSelection) {
      return;
    }

    const flattenedIds = flattenIds<RenderProps>(data);

    const handleDirectionKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
        return;
      }
      if (selectedId === undefined) {
        setSelectedId(flattenedIds[0]);
        return;
      }
      let selectedIndex = flattenedIds.indexOf(selectedId);
      if (e.key === 'ArrowDown') {
        selectedIndex < flattenedIds.length - 1 && selectedIndex++;
      }
      if (e.key === 'ArrowUp') {
        selectedIndex > 0 && selectedIndex--;
      }

      setSelectedId(flattenedIds[selectedIndex]);
    };

    const handleEnterKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') {
        return;
      }
      selectedId && onSelect?.(selectedId);
    };

    document.addEventListener('keydown', handleDirectionKeyDown);
    document.addEventListener('keydown', handleEnterKeyDown);

    return () => {
      document.removeEventListener('keydown', handleDirectionKeyDown);
      document.removeEventListener('keydown', handleEnterKeyDown);
    };
  }, [data, enableKeyboardSelection, onSelect, selectedId]);

  return {
    selectedId,
  };
};

export default useSelectWithKeyboard;
