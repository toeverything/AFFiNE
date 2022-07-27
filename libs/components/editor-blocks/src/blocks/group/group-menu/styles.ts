import { styled } from '@toeverything/components/ui';

export const PanelItem = styled('div')({
    display: 'flex',
    userSelect: 'none',

    '& + &': {
        marginTop: '8px',
    },
});
