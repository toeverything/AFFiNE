import {
    AsyncBlock,
    useCurrentView,
    useLazyIframe,
} from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';
import {
    FC,
    ReactElement,
    ReactNode,
    useEffect,
    useRef,
    useState,
} from 'react';
import { SCENE_CONFIG } from '../../blocks/group/config';
import { BlockPreview } from './BlockView';
import { formatUrl } from './format-url';

export interface Props {
    block: AsyncBlock;
    editorElement?: () => JSX.Element;
    viewType?: string;
    link: string;
    // onResizeEnd: (data: any) => void;
    isSelected: boolean;
    resize?: boolean;
}

const getHost = (url: string) => new URL(url).host;
const MouseMaskContainer = styled('div')({
    position: 'absolute',
    zIndex: 1,
    top: '0px',
    left: '0px',
    right: '0px',
    bottom: '0px',
    backgroundColor: 'transparent',
    '&:hover': {
        pointerEvents: 'none',
    },
});
const LinkContainer = styled('div')<{
    isSelected: boolean;
}>(({ theme, isSelected }) => {
    return {
        // overflow: 'hidden',
        borderRadius: theme.affine.shape.borderRadius,
        fontSize: '0',
        background: isSelected ? 'rgba(152, 172, 189, 0.2)' : '#fafafa',
        padding: '0 8px',
        width: '100%',
        height: '72px',
        lineHeight: '32px',
        border: '1px solid #ccc',
        cursor: 'pointer',
        p: {
            overflow: 'hidden',
            fontSize: theme.affine.typography.body1.fontSize,
            height: '36px',
            textOverflow: 'ellipsis',
        },
    };
});
const _getLinkStyle = (scene: string) => {
    switch (scene) {
        case SCENE_CONFIG.PAGE:
            return {
                width: '420px',
                height: '198px',
            };
        default:
            return {
                width: '252px',
                height: '126px',
            };
    }
};
const SourceViewContainer = styled('div')<{
    isSelected: boolean;
    scene: string;
}>(({ theme, isSelected, scene }) => {
    return {
        ..._getLinkStyle(scene),
        overflow: 'hidden',
        position: 'relative',
        borderRadius: theme.affine.shape.borderRadius,
        background: isSelected ? 'rgba(152, 172, 189, 0.1)' : 'transparent',
        padding: '8px',
        iframe: {
            width: '100%',
            height: '100%',
            border: '1px solid #EAEEF2',
            borderRadius: theme.affine.shape.borderRadius,
            userSelect: 'none',
        },
    };
});

const LazyIframe = ({
    src,
    delay = 3000,
    fallback,
}: {
    src: string;
    delay?: number;
    fallback?: ReactNode;
}) => {
    const [show, setShow] = useState(false);
    const timer = useRef<number>();

    useEffect(() => {
        // Hide iframe when the src changed
        setShow(false);
    }, [src]);

    const onLoad = () => {
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
            // Prevent iframe scrolling parent container
            // Remove the delay after the issue is resolved
            // See W3C https://github.com/w3c/csswg-drafts/issues/7134
            // See https://forum.figma.com/t/prevent-figmas-embed-code-from-automatically-scrolling-to-it-on-page-load/26029/6
            setShow(true);
        }, delay);
    };

    return (
        <>
            <div
                onMouseDown={e => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                style={{ display: show ? 'block' : 'none', height: '100%' }}
            >
                <iframe src={src} onLoad={onLoad} />
            </div>
            {show ? '' : fallback}
        </>
    );
};

const Loading = styled('div')(() => {
    return {
        width: '100%',
        height: '100%',
        display: 'flex',
        lineHeight: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #EAEEF2',
    };
});

const LoadingContiner = () => {
    return <Loading>loading...</Loading>;
};

export const SourceView: FC<Props> = props => {
    const { link, isSelected, block, editorElement } = props;
    const src = formatUrl(link);
    // let iframeShow = useLazyIframe(src, 3000, iframeContainer);
    const [currentView] = useCurrentView();
    const { type } = currentView;
    if (src?.startsWith('http')) {
        return (
            <div style={{ display: 'flex' }}>
                <SourceViewContainer isSelected={isSelected} scene={type}>
                    <MouseMaskContainer />

                    <LazyIframe
                        src={src}
                        fallback={LoadingContiner()}
                    ></LazyIframe>
                </SourceViewContainer>
            </div>
        );
    } else if (src?.startsWith('affine')) {
        return (
            <SourceViewContainer
                isSelected={isSelected}
                style={{ padding: '0' }}
                scene={type}
            >
                <BlockPreview
                    block={block}
                    editorElement={editorElement}
                    blockId={src}
                />
            </SourceViewContainer>
        );
    }
    return null;
};
