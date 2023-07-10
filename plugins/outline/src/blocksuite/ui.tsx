import type { PageBlockModel } from '@blocksuite/blocks';
import type { Page } from '@blocksuite/store';
import type { FC } from 'react';
import { useCallback } from 'react';
import scrollIntoView from 'smooth-scroll-into-view-if-needed';

import {
  outlineContainerStyle,
  outlineContentStyle,
  outlineHeaderStyle,
  outlineMenuItemStyle,
} from './index.css';

export type OutlineProps = {
  page: Page;
};
function isHeading(str?: string) {
  return /^h[1-6]$/.test(str ?? '');
}
const getOutlineStructure = (root: PageBlockModel) => {
  const children = root.children;
  const directoryTree: {
    level: number;
    title: string;
    id: string;
  }[] = [];
  for (const child of children) {
    for (const heading of child.children) {
      if (heading.type && isHeading(heading.type)) {
        console.log(heading + '1');
        const headingLevel = parseInt(heading.type.charAt(1));
        directoryTree.push({
          level: headingLevel,
          id: heading.id,
          title: heading.text?.toString() ?? '',
        });
      }
    }
  }
  return directoryTree;
};

export const OutlineUI: FC<OutlineProps> = ({ page }) => {
  const title = (page.root as PageBlockModel).title.toString();
  const root = page.root as PageBlockModel;
  const tree = getOutlineStructure(root);
  const handleNav = useCallback((id: string) => {
    const target = document.querySelector(`[data-block-id="${id}"]`);
    if (!target) return;
    scrollIntoView(target, {
      behavior: 'smooth',
      scrollMode: 'always',
      block: 'center',
      inline: 'center',
    });
  }, []);
  return (
    <div className={outlineContainerStyle}>
      <div className={outlineHeaderStyle}>Outline</div>
      <div>{title}</div>
      <div className={outlineContentStyle}>
        {tree.map((item, index) => {
          return (
            <div
              onClick={() => handleNav(item.id)}
              key={index}
              className={outlineMenuItemStyle}
              style={{ marginLeft: (item.level - 1) * 10 }}
            >
              {item.title}
            </div>
          );
        })}
      </div>
    </div>
  );
};
