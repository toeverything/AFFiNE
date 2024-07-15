import { Service } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';

import { TagList } from '../entities/tag-list';

type TagColorHelper<T> = T extends `paletteLine${infer Color}` ? Color : never;
export type TagColorName = TagColorHelper<Parameters<typeof cssVar>[0]>;

const tagColorIds: TagColorName[] = [
  'Red',
  'Magenta',
  'Orange',
  'Yellow',
  'Green',
  'Teal',
  'Blue',
  'Purple',
  'Grey',
];

export class TagService extends Service {
  tagList = this.framework.createEntity(TagList);

  tagColors = tagColorIds.map(
    color => [color, cssVar(`paletteLine${color}`)] as const
  );

  randomTagColor() {
    const randomIndex = Math.floor(Math.random() * this.tagColors.length);
    return this.tagColors[randomIndex][1];
  }
}
