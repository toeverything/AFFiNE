import { bodyEmphasized, bodyRegular } from '@toeverything/theme/typography';
import { style } from '@vanilla-extract/css';

// desktop
export const desktopStyles = {
  container: style({
    display: 'flex',
    flexDirection: 'column',
  }),
  description: style({}),
  header: style({}),
  content: style({
    height: '100%',
    overflowY: 'auto',
    padding: '12px 4px 20px 4px',
  }),
  footer: style({
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
  }),
  action: style({}),
};

// mobile
export const mobileStyles = {
  container: style({
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 0 !important',
    borderRadius: 22,
  }),
  description: style([
    bodyRegular,
    {
      padding: '11px 22px',
    },
  ]),
  header: style([
    bodyEmphasized,
    {
      padding: '10px 16px',
      marginBottom: '0px !important',
    },
  ]),
  content: style([
    bodyRegular,
    {
      padding: '11px 22px',
    },
  ]),
  footer: style({
    padding: '8px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    selectors: {
      '&.row': {
        flexDirection: 'row',
        justifyContent: 'space-between',
      },
      '&.reverse': {
        flexDirection: 'column-reverse',
      },
      '&.rowReverse': {
        flexDirection: 'row-reverse',
      },
    },
  }),
  action: style([
    bodyRegular,
    {
      width: '100%',
      height: 44,
      borderRadius: 8,
      fontSize: 17,
      fontWeight: 400,
      selectors: {
        '&.row': {
          width: 'auto',
          minWidth: 0,
          maxWidth: 140,
          flex: 1,
          height: 32,
        },
      },
    },
  ]),
};
