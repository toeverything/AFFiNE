import { TagItem as TagItemComponent } from '@affine/core/components/tags';
import type { Tag } from '@affine/core/modules/tag';
import { useLiveData } from '@toeverything/infra';

export interface PageTagsProps {
  tags: Tag[];
  maxItems?: number; // max number to show. if not specified, show all. if specified, show the first n items and add a "..." tag
  widthOnHover?: number | string; // max width on hover
  hoverExpandDirection?: 'left' | 'right'; // expansion direction on hover
}

interface TagItemProps {
  tag?: Tag;
  idx?: number;
  maxWidth?: number | string;
  mode: 'inline' | 'list-item';
  focused?: boolean;
  onRemoved?: () => void;
  style?: React.CSSProperties;
}

export const TagItem = ({ tag, ...props }: TagItemProps) => {
  const value = useLiveData(tag?.value$);
  const color = useLiveData(tag?.color$);

  if (!tag || !value || !color) {
    return null;
  }

  return (
    <TagItemComponent
      {...props}
      mode={props.mode === 'inline' ? 'inline-tag' : 'list-tag'}
      tag={{
        id: tag?.id,
        name: value,
        color: color,
      }}
    />
  );
};
