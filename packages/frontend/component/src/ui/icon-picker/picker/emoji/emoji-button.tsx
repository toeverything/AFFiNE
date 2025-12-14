import { memo, useCallback } from 'react';

import { IconButton } from '../../../button';

// Memoized individual emoji button to prevent unnecessary re-renders
export const EmojiButton = memo(function EmojiButton({
  emoji,
  onSelect,
}: {
  emoji: string;
  onSelect: (emoji: string) => void;
}) {
  const handleClick = useCallback(() => {
    onSelect(emoji);
  }, [emoji, onSelect]);

  return (
    <IconButton
      key={emoji}
      size={24}
      style={{ padding: 4 }}
      icon={<span>{emoji}</span>}
      iconStyle={{ justifyContent: 'center' }}
      onClick={handleClick}
    />
  );
});
