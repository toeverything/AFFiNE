import {
    AsyncBlock,
    useCurrentView,
    useLazyIframe,
} from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';
import { FC, useRef } from 'react';
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
const IframeContainer = styled('div')<{ show: boolean }>(({ show }) => {
    return {
        height: '100%',
        display: show ? 'block' : 'none',
    };
});
export const SourceView: FC<Props> = props => {
    const { link, isSelected, block, editorElement } = props;
    const src = formatUrl(link);

    const iframeContainer = useRef(null);
    let iframeShow = useLazyIframe(src, 3000, iframeContainer);
    const [currentView] = useCurrentView();
    const { type } = currentView;
    if (src?.startsWith('http')) {
        return (
            <div style={{ display: 'flex' }}>
                <SourceViewContainer isSelected={isSelected} scene={type}>
                    <MouseMaskContainer />
                    <IframeContainer
                        onMouseDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        show={iframeShow}
                        ref={iframeContainer}
                    ></IframeContainer>
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
