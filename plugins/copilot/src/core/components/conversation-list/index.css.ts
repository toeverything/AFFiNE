import { style } from '@vanilla-extract/css';

export const conversationListStyle = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  height: 'calc(100% - 100px)',
  overflow: 'auto',
});
