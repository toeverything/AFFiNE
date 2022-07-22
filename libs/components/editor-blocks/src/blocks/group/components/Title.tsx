import { styled } from '@toeverything/components/ui';

const StyledTitle = styled('div')({
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    fontSize: 16,
    lineHeight: '22px',
    '& > div': {
        marginRight: 4,
    },
    color: '#3A4C5C',
    fontWeight: 400,
});

export { StyledTitle as Title };
