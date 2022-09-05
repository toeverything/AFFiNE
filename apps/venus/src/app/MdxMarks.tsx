import { Box, Typography } from '@mui/joy';

type NameProps = {
    name: string;
    link: string;
    title: string;
    description?: string;
};

export const Name = (props: NameProps) => {
    return (
        <>
            <Typography>
                <span style={{ fontSize: '1em' }}>
                    <Box
                        component="a"
                        href={props.link}
                        sx={{
                            pointerEvents: 'none',
                            color: '#000!important',
                            '&:hover': {
                                color: 'unset',
                            },
                        }}
                    >
                        {props.name}
                    </Box>
                </span>
                <span style={{ color: '#57606a' }}>
                    {' | '}
                    {props.title}
                </span>
            </Typography>
            {props.description ? (
                <Typography>
                    <span style={{ color: '#aaa' }}>{props.description}</span>
                </Typography>
            ) : null}
        </>
    );
};

export const Padding = () => {
    return <div style={{ paddingTop: '1em' }} />;
};
