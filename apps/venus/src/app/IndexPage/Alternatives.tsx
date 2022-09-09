import { Box, Typography } from '@mui/joy';
import { styled } from '@mui/joy/styles';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { useMediaQuery } from '@mui/material';

const Alternatives = styled(Box)<{ width: string }>(({ width }) => ({
    position: 'relative',
    width: '24em',
    height: '128px',
    transform: 'translateY(-8px)',
    overflowY: 'hidden',
    '@media (max-width: 1024px)': {
        width,
        height: '48px',
        transform: 'translateY(0)',
    },
    '& .scroll-element': {
        width: 'inherit',
        height: 'inherit',
        position: 'absolute',
        left: '0',
        top: '-23px',
        paddingTop: '22px',
        lineHeight: '96px',
        '@media (max-width: 1024px)': {
            lineHeight: '32px',
        },
    },
    '& .scroll-element.active': {
        animation: 'primary 500ms linear infinite',
    },
    '.primary.active': {
        animation: 'primary 500ms linear infinite',
    },
    '.secondary.active': {
        animation: 'secondary 500ms linear infinite',
    },
    '@keyframes primary': {
        from: {
            top: '0%',
        },
        to: {
            top: '-100%',
        },
    },
    '@keyframes secondary': {
        from: {
            top: '100%',
        },
        to: {
            top: '0%',
        },
    },
}));

const _alternatives = ['Notion', 'Miro', 'Monday'];
const _alternativesSize = [8, 6, 10];

export const AlternativesProduct = () => {
    const [idx, setIdx] = useState(0);
    const [last, current] = useMemo(
        () => [
            _alternatives[idx],
            _alternatives[idx + 1] ? _alternatives[idx + 1] : _alternatives[0],
        ],
        [idx]
    );
    const maxWidth = useMemo(() => _alternativesSize[idx], [idx]);
    const [active, setActive] = useState(false);
    const matches = useMediaQuery('(max-width: 1024px)');

    useEffect(() => {
        const handle = setInterval(() => {
            setActive(true);
            setTimeout(
                () => {
                    setIdx(idx => (_alternatives[idx + 1] ? idx + 1 : 0));
                    setActive(false);
                },
                matches ? 450 : 380
            );
        }, 2000);
        return () => clearInterval(handle);
    }, [matches]);

    return (
        <Alternatives
            width={`${maxWidth}em`}
            sx={{
                margin: 'auto',
                marginRight: '1em',
                transition: 'width .5s',
                '@media (max-width: 1024px)': {
                    width: '8em',
                },
            }}
        >
            <Box
                className={clsx(
                    'scroll-element',
                    'primary',
                    active && 'active'
                )}
            >
                <Typography
                    fontSize="96px"
                    fontWeight={900}
                    sx={{
                        color: '#06449d',
                        textAlign: 'right',
                        overflow: 'hidden',
                        '@media (max-width: 1024px)': {
                            fontSize: '32px',
                        },
                    }}
                >
                    {last}
                </Typography>
            </Box>
            <Box
                className={clsx(
                    'scroll-element',
                    'primary',
                    active && 'active'
                )}
                sx={{
                    marginTop: '96px',
                    textAlign: 'right',
                    overflow: 'hidden',
                    '@media (max-width: 1024px)': {
                        marginTop: '48px',
                    },
                }}
            >
                <Typography
                    fontSize="96px"
                    fontWeight={900}
                    sx={{
                        color: '#06449d',
                        overflow: 'hidden',
                        '@media (max-width: 1024px)': {
                            fontSize: '32px',
                        },
                    }}
                >
                    {current}
                </Typography>
            </Box>
        </Alternatives>
    );
};
