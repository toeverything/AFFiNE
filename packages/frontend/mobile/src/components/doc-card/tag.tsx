import { observeResize } from '@affine/component';
import type { Tag } from '@affine/core/modules/tag';
import { TagService } from '@affine/core/modules/tag';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useCallback, useEffect, useRef } from 'react';

import * as styles from './tag.css';

const DocCardTag = ({ tag }: { tag: Tag }) => {
  const name = useLiveData(tag.value$);
  const color = useLiveData(tag.color$);

  return (
    <li
      data-name={name}
      data-color={color}
      className={styles.tag}
      style={assignInlineVars({ [styles.tagColorVar]: color })}
    >
      {name}
    </li>
  );
};

const GAP = 4;
const MIN_WIDTH = 32;

const DocCardTagsRenderer = ({ tags, rows }: { tags: Tag[]; rows: number }) => {
  const ulRef = useRef<HTMLUListElement>(null);

  // A strategy to layout tags
  const layoutTags = useCallback(
    (entry: ResizeObserverEntry) => {
      const availableWidth = entry.contentRect.width;
      const lis = Array.from(ulRef.current?.querySelectorAll('li') ?? []);

      const tagGrid: Array<{
        x: number;
        y: number;
        w: number;
        el: HTMLLIElement;
      }> = [];

      for (let i = 0; i < rows; i++) {
        let width = 0;
        let restSpace = availableWidth - width;
        while (restSpace >= MIN_WIDTH) {
          const li = lis.shift();
          if (!li) break;
          const liWidth = li.scrollWidth + 2; // 2 is for border
          let liDisplayWidth = Math.min(liWidth, restSpace);

          restSpace = restSpace - liDisplayWidth - GAP;
          if (restSpace < MIN_WIDTH) {
            liDisplayWidth += restSpace;
          }

          tagGrid.push({
            x: width,
            y: i * (22 + GAP),
            w: liDisplayWidth,
            el: li,
          });

          width += liDisplayWidth + GAP;
        }
      }

      const lastItem = tagGrid[tagGrid.length - 1];

      tagGrid.forEach(({ el, x, y, w }) => {
        Object.assign(el.style, {
          width: `${w}px`,
          transform: `translate(${x}px, ${y}px)`,
          visibility: 'visible',
        });
      });

      // hide rest
      lis.forEach(li =>
        Object.assign(li.style, {
          visibility: 'hidden',
          width: '0px',
          transform: `translate(0px, ${lastItem.y + 22 + GAP}px)`,
        })
      );

      // update ul height
      // to avoid trigger resize immediately
      setTimeout(() => {
        if (ulRef.current) {
          ulRef.current.style.height = `${lastItem.y + 22}px`;
        }
      });
    },
    [rows]
  );

  const prevEntryRef = useRef<ResizeObserverEntry | null>(null);
  useEffect(() => {
    tags; // make sure tags is in deps
    const ul = ulRef.current;
    if (!ul) return;

    const dispose = observeResize(ul, entry => {
      if (entry.contentRect.width === prevEntryRef.current?.contentRect.width) {
        return;
      }

      layoutTags(entry);
      prevEntryRef.current = entry;
    });
    return () => {
      dispose();
      prevEntryRef.current = null;
    };
  }, [layoutTags, tags]);

  return (
    <ul className={styles.tags} ref={ulRef} style={{ gap: GAP }}>
      {tags.map(tag => (
        <DocCardTag key={tag.id} tag={tag} />
      ))}
      {/* TODO: more icon */}
      {/* <MoreHorizontalIcon /> */}
    </ul>
  );
};

export const DocCardTags = ({
  docId,
  rows = 2,
}: {
  docId: string;
  rows?: number;
}) => {
  const tagService = useService(TagService);
  const tags = useLiveData(tagService.tagList.tagsByPageId$(docId));

  if (!tags.length) return null;
  return <DocCardTagsRenderer tags={tags} rows={rows} />;
};
