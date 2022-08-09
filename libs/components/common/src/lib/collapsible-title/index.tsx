import { useState } from 'react';
import {
    MuiButton as Button,
    MuiCollapse as Collapse,
    styled,
} from '@toeverything/components/ui';
import {
    ArrowDropDownIcon,
    ArrowRightIcon,
} from '@toeverything/components/icons';

const StyledContainer = styled('div')({
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    '&:hover': {
        background: '#f5f7f8',
        borderRadius: '5px',
    },
});

export type CollapsibleTitleProps = {
    title?: string;
    initialOpen?: boolean;
    icon?: React.ReactNode;
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
};

export function CollapsibleTitle(props: CollapsibleTitleProps) {
    const { children, title, initialOpen = true } = props;

    const [open, setOpen] = useState(initialOpen);

    return (
        <>
            <StyledContainer onClick={() => setOpen(prev => !prev)}>
                {open ? (
                    <ArrowDropDownIcon sx={{ color: '#566B7D' }} />
                ) : (
                    <ArrowRightIcon sx={{ color: '#566B7D' }} />
                )}
                <div
                    style={{
                        color: '#98ACBD',
                        textTransform: 'none',
                        fontSize: '12px',
                        fontWeight: '600',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    {title}
                </div>
            </StyledContainer>
            {children ? (
                <Collapse in={open} timeout="auto" unmountOnExit>
                    {children}
                </Collapse>
            ) : null}
        </>
    );
}

export default CollapsibleTitle;
