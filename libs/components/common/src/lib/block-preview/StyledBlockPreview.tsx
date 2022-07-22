import { useEffect, useRef, useState } from 'react';
import { PagesIcon } from '@toeverything/components/icons';
import { styled } from '@toeverything/components/ui';

type PreviewSize = 'sm' | 'md' | 'lg';

type StyledBlockPreviewProps = {
    title: string;
    children: JSX.Element;
    className?: string;
    onClick?: () => void;
    onMouseOver?: () => void;
    hover?: boolean;
};

const BaseContainer = styled('div')<{ size: PreviewSize }>(({ size }) => {
    const append =
        size === 'sm'
            ? {}
            : {
                  maxWidth: '18em',

                  lineHeight: '1.5em',
                  overflowWrap: 'anywhere',
              };
    return {
        background: '#3E6FDB',
        display: 'flex',
        flexDirection: size === 'sm' ? 'column' : 'row',
        rowGap: '0.5em',
        height: size === 'sm' ? '182px' : size === 'md' ? '180px' : '174px',
        padding: '1em',
        paddingBottom: '0',
        marginBottom: size !== 'lg' ? '20px' : '0',
        append,
    };
});

const PreviewContainer = styled('div')<{ size: PreviewSize }>(({ size }) => {
    return {
        minWidth: '272px',
        position: 'absolute',
        bottom: '0',
        overflow: 'hidden',
        ...(size === 'sm'
            ? { top: '2.5em', left: '0', right: '0' }
            : { top: '0.5em', right: '2em' }),
    };
});

const Preview = styled('div')<{ size: PreviewSize }>({
    backgroundColor: 'white',
    borderRadius: '10px 10px 0 0',
    boxShadow: '1px 1px 0.5em 0 #000a',
    margin: '1em auto',
    height: '100%',
    width: '256px',
});

const Title = styled('div')<{ size: PreviewSize }>(({ size }) => {
    const append =
        size === 'sm'
            ? {}
            : {
                  maxWidth: '50%',
                  alignItems: 'top',
              };

    return {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        columnGap: '0.5em',
        margin: size === 'sm' ? '0.25em 0.5em' : '0.5em 1em',
        color: 'white',
        ...append,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        '&>span': {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        },
    };
});

const ScopedEditorWrapper = styled('div')<{ size: PreviewSize }>(({ size }) => {
    return {
        width: '750px',
        height: '750px',
        transform: 'scale(32%) translate(-102%, -104%)',
        // eslint-disable-next-line @typescript-eslint/naming-convention
        '&>:first-child': {
            margin: 'auto',
            marginTop: 0,
            overflow: 'hidden',
            userSelect: 'none',
            pointerEvents: 'none',
            padding: 0,
        },
    };
});

export const StyledBlockPreview = (props: StyledBlockPreviewProps) => {
    const { title } = props;
    const container = useRef<HTMLDivElement>();
    const [size, setSize] = useState<PreviewSize>();

    useEffect(() => {
        if (container?.current) {
            const element = container?.current;
            const resizeObserver = new ResizeObserver(entries => {
                const width = entries?.[0]?.contentRect.width;
                if (width > 726) setSize('lg');
                else if (width > 440) setSize('md');
                else setSize('sm');
            });

            resizeObserver.observe(element);
            return () => resizeObserver.unobserve(element);
        }
        return undefined;
    }, [container]);

    return (
        <BaseContainer ref={container} style={{ width: '100%' }} size={size}>
            {size ? (
                <>
                    <Title size={size}>
                        <PagesIcon />
                        <span>{title}</span>
                    </Title>
                    <PreviewContainer size={size}>
                        <Preview size={size}>
                            <ScopedEditorWrapper size={size}>
                                {(container?.current && props.children) || null}
                            </ScopedEditorWrapper>
                        </Preview>
                    </PreviewContainer>
                </>
            ) : null}
        </BaseContainer>
    );
};
