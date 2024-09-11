import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const workspaceListsWrapper = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
  maxHeight: 'calc(100vh - 300px)',
});
export const workspaceListWrapper = style({
  display: 'flex',
  width: '100%',
  flexDirection: 'column',
  gap: 2,
});
export const workspaceType = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '0px 12px',
  fontWeight: 500,
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVar('textSecondaryColor'),
});
export const workspaceTypeIcon = style({
  color: cssVar('iconSecondary'),
});
export const scrollbar = style({
  width: '4px',
});
export const workspaceCard = style({
  height: '44px',
  padding: '0 12px',
});
