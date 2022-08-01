import { styled } from '@toeverything/components/ui';
import type { CSSProperties } from 'react';

export const KanbanContainer = styled('div')({
    display: 'flex',
    padding: '15px 0',

    // Scrollbars
    // Always show scrollbars when hover
    // See https://stackoverflow.com/questions/7492062/css-overflow-scroll-always-show-vertical-scroll-bar
    // See https://developer.mozilla.org/en-US/docs/Web/CSS/::-webkit-scrollbar
    overflowX: 'scroll',
    // Set overflowY to 'hidden' to workaround the scrollbars flash when drag kanban card
    overflowY: 'hidden',
    webkitOverflowScrolling: 'auto',
    '::-webkit-scrollbar': {
        webkitAppearance: 'none',
        height: '7px',
    },
    '&:hover': {
        '&::-webkit-scrollbar-thumb': {
            borderRadius: '4px',
            backgroundColor: '#98ACBD33',
        },
        '&::-webkit-scrollbar': {
            borderRadius: '4px',
            backgroundColor: '#98ACBD1A',
        },
    },
    // scrollbarGutter: 'stable',
    // overscrollBehavior: 'contain',

    '& > * + *': {
        marginLeft: '20px',
    },
});

export const KanbanBoard = styled('div')({
    display: 'flex',
    width: '296px',
    flex: '0 0 296px',
    flexDirection: 'column',
});

export const KanbanGroup = styled('div')({
    marginTop: '18px',

    display: 'flex',
    flexDirection: 'column',
    '& > * + *': {
        marginTop: '10px',
    },
});

export const KanbanHeader = styled('div')({
    whiteSpace: 'nowrap',
    color: '#3A4C5C',
    fontSize: '12px',
});

export const Tag = styled('div')<{
    interactive?: boolean;
    color?: CSSProperties['color'];
    background?: CSSProperties['background'];
}>(({ interactive, color, background }) => ({
    display: 'inline-flex',
    justifyContent: 'center',
    height: '20px',
    alignItems: 'center',
    whiteSpace: 'nowrap',
    borderRadius: '10px',
    background: background ?? '#ECEFF2',
    color: color ?? '#3A4C5C',
    fontSize: '12px',
    padding: '0 8px',
    cursor: interactive ? 'pointer' : 'default',
    userSelect: 'none',
}));

export const AddGroupWrapper = styled('div')({
    display: 'flex',
    alignItems: 'center',
    borderRadius: '5px',
    width: '100%',
    color: '#B7C5D1',
    background: '#F5F7F8',
    fontSize: '12px',
    padding: '3px 15px',
    cursor: 'pointer',
});

export const PopperContainer = styled('div')`
    color: #4c6275;
    background: #fff;
    box-shadow: 0px 1px 10px rgba(152, 172, 189, 0.6);
    border-radius: 0px 10px 10px 10px;
    padding: 6px 12px;

    display: flex;
    justify-content: center;

    & > input::placeholder {
        color: #98acbd;
    }
`;
