import { useState } from 'react';
import clsx from 'clsx';
import style9 from 'style9';
import {
    MuiButton as Button,
    MuiCollapse as Collapse,
} from '@toeverything/components/ui';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';

const styles = style9.create({
    ligoButton: {
        textTransform: 'none',
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
    const { className, style, children, title, initialOpen = true } = props;

    const [open, setOpen] = useState(initialOpen);

    return (
        <>
            <Button
                startIcon={
                    open ? (
                        <ArrowDropDownIcon sx={{ color: '#566B7D' }} />
                    ) : (
                        <ArrowRightIcon sx={{ color: '#566B7D' }} />
                    )
                }
                onClick={() => setOpen(prev => !prev)}
                sx={{ color: '#566B7D', textTransform: 'none' }}
                className={clsx(styles('ligoButton'), className)}
                style={style}
                disableElevation
                disableRipple
            >
                {title}
            </Button>
            {children ? (
                <Collapse in={open} timeout="auto" unmountOnExit>
                    {children}
                </Collapse>
            ) : null}
        </>
    );
}

export default CollapsibleTitle;
