import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import { InlineTagList } from './inline-tag-list';
import { TagItem } from './tag';
import { TagEditMenu } from './tag-edit-menu';
import { TagsInlineEditor } from './tags-editor';
import type { TagColor, TagLike } from './types';

export default {
  title: 'UI/Tags',
} satisfies Meta;

const tags: TagLike[] = [
  { id: '1', value: 'tag', color: 'red' },
  { id: '2', value: 'tag2', color: 'blue' },
  { id: '3', value: 'tag3', color: 'green' },
];

const tagColors: TagColor[] = [
  { id: '1', value: 'red', name: 'Red' },
  { id: '2', value: 'blue', name: 'Blue' },
  { id: '3', value: 'green', name: 'Green' },
];

export const Tags: StoryFn = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <TagItem
        tag={{ id: '1', value: 'tag', color: 'red' }}
        mode="inline-tag"
        focused
        onRemoved={() => {
          console.log('removed');
        }}
      />
      <TagItem
        tag={{ id: '2', value: 'tag2', color: 'blue' }}
        mode="inline-tag"
      />
      <TagItem
        tag={{ id: '3', value: 'tag3', color: '#DCFDD7' }}
        mode="db-label"
      />
      <TagItem
        tag={{ id: '3', value: 'tag5', color: '#DCFDD7' }}
        mode="db-label"
        focused
        onRemoved={() => {
          console.log('removed');
        }}
      />
      <TagItem tag={{ id: '1', value: 'tag', color: 'red' }} mode="list-tag" />
    </div>
  );
};

export const InlineTagListStory: StoryFn = () => {
  return <InlineTagList tagMode="inline-tag" tags={tags} />;
};

export const TagEditMenuStory: StoryFn = () => {
  return (
    <TagEditMenu
      tag={tags[0]}
      colors={tagColors}
      onTagChange={() => {}}
      onTagDelete={() => {}}
      jumpToTag={() => {}}
    >
      <div>Trigger Edit Tag Menu</div>
    </TagEditMenu>
  );
};

export const TagsInlineEditorStory: StoryFn = () => {
  const [options, setOptions] = useState<TagLike[]>(tags);
  const [selectedTags, setSelectedTags] = useState<string[]>(
    options.slice(0, 1).map(item => item.id)
  );

  return (
    <TagsInlineEditor
      tags={options}
      tagMode="db-label"
      selectedTags={selectedTags}
      onCreateTag={(name, color) => {
        const newTag = {
          id: (options.at(-1)!.id ?? 0) + 1,
          value: name,
          color,
        };
        setOptions(prev => [...prev, newTag]);
        return newTag;
      }}
      tagColors={tagColors}
      onTagChange={(id, property, value) => {
        setOptions(prev => {
          const index = prev.findIndex(item => item.id === id);
          if (index === -1) {
            return prev;
          }
          return options.toSpliced(index, 1, {
            ...options[index],
            [property]: value,
          });
        });
      }}
      onDeleteTag={tagId => {
        setOptions(prev => prev.filter(item => item.id !== tagId));
      }}
      onSelectTag={tagId => {
        setSelectedTags(prev => [...prev, tagId]);
      }}
      onDeselectTag={tagId => {
        setSelectedTags(prev => prev.filter(id => id !== tagId));
      }}
    />
  );
};
