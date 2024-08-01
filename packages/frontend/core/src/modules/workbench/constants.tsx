import {
  AllDocsIcon,
  DeleteIcon,
  EdgelessIcon,
  PageIcon,
  TagIcon,
  TodayIcon,
  ViewLayersIcon,
} from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';

export const iconNameToIcon = {
  allDocs: <AllDocsIcon />,
  collection: <ViewLayersIcon />,
  doc: <PageIcon />,
  page: <PageIcon />,
  edgeless: <EdgelessIcon />,
  journal: <TodayIcon />,
  tag: <TagIcon />,
  trash: <DeleteIcon />,
} satisfies Record<string, ReactNode>;

export type ViewIconName = keyof typeof iconNameToIcon;
