import Button from '@mui/joy/Button';
// eslint-disable-next-line no-restricted-imports
import { styled, Tooltip, type TooltipProps } from '@mui/material';

interface HoverMenuProps {
    title: string;
    options: Array<{ title: string; value: string }>;
    onSelect: (value: string) => void;
}

export function HoverMenu({ title, options, onSelect }: HoverMenuProps) {
    return (
        <StyledTooltip
            title={
                <>
                    {options.map(option => {
                        return (
                            <ListItem
                                key={option.value}
                                href={option.value}
                                target="_blank"
                                title={option.value}
                                onClick={() => {
                                    onSelect(option.value);
                                }}
                            >
                                {option.title}
                            </ListItem>
                        );
                    })}
                </>
            }
        >
            <Button
                variant="plain"
                color="neutral"
                sx={{
                    fontSize: '16px',
                }}
                size="md"
            >
                {title}
            </Button>
        </StyledTooltip>
    );
}

const StyledTooltip = styled(({ className, ...props }: TooltipProps) => (
    <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
    '& .MuiTooltip-tooltip': {
        backgroundColor: 'white',
        boxShadow: theme.shadows[4],
        color: '#272930',
        zIndex: '1500',
    },
}));

const ListItem = styled('a')({
    display: 'block',
    fontSize: '16px',
    lineHeight: '32px',
    padding: '5px',
    cursor: 'pointer',
    borderRadius: '4px',
    color: '#272930',
    textDecoration: 'none',

    '&:hover': {
        color: '#131418',
        backgroundColor: '#eeeff0',
    },
});
