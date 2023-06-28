import { globalStyle, style } from '@vanilla-extract/css';

export const memberList = style({
  marginTop: '12px',
});

globalStyle(`${memberList} .member-list-item`, {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});
globalStyle(`${memberList} .member-list-item:not(:last-of-type)`, {
  marginBottom: '8px',
});

globalStyle(`${memberList} .left-col`, {
  display: 'flex',
  alignItems: 'center',
  width: '60%',
});
globalStyle(`${memberList} .right-col`, {
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  width: '35%',
});
globalStyle(`${memberList} .user-info-wrapper`, {
  flexGrow: 1,
  marginLeft: '12px',
  overflow: 'hidden',
});

globalStyle(`${memberList} .user-info-wrapper p`, {
  width: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

globalStyle(`${memberList} .user-name`, {
  fontSize: 'var(--affine-font-sm)',
});
globalStyle(`${memberList} .email`, {
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
});
globalStyle(`${memberList} .user-identity`, {
  fontSize: 'var(--affine-font-sm)',
  marginRight: '15px',
  flexGrow: '1',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
