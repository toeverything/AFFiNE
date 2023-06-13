import { style } from '@vanilla-extract/css';

export const followingUpStyle = style({
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: '10px',
  alignItems: 'flex-start',
});

export const questionStyle = style({
  backgroundColor: 'white',
  borderRadius: '8px',
  color: '#8E8D91',
  padding: '2px 10px',
  cursor: 'pointer',
});
