import { style } from '@vanilla-extract/css';

export const confirmModalContent = style({
  marginTop: '12px',
  marginBottom: '20px',
  height: '100%',
  overflowY: 'auto',
  padding: '0 4px',
});
export const confirmModalContainer = style({
  display: 'flex',
  flexDirection: 'column',
});
export const modalFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  paddingTop: '40px',
  marginTop: 'auto',
  gap: '20px',
  selectors: {
    '&.modalFooterWithChildren': {
      paddingTop: '20px',
    },
    '&.reverse': {
      flexDirection: 'row-reverse',
      justifyContent: 'flex-start',
    },
  },
});
