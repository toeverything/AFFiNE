import { FC } from 'react';

import { styled } from '@toeverything/components/ui';
import { AsyncBlock, useRecastBlockScene } from '@toeverything/framework/virgo';

import { formatUrl } from './format-url';
import { SCENE_CONFIG } from '../../blocks/group/config';
import { BlockPreview } from './BlockView';
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
export interface Props {
    block: AsyncBlock;
    editorElement?: () => JSX.Element;
    viewType?: string;
    link: string;
    // onResizeEnd: (data: any) => void;
    isSelected: boolean;
    resize?: boolean;
}

const _getLinkStyle = (scene: string) => {
    switch (scene) {
        case SCENE_CONFIG.PAGE:
            return {
                width: '420px',
                height: '198px',
            };
        case SCENE_CONFIG.REFLINK:
            return {};
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
        borderRadius: theme.affine.shape.borderRadius,
        background: isSelected ? 'rgba(152, 172, 189, 0.1)' : 'transparent',
        padding: '8px',
        iframe: {
            width: '100%',
            height: '100%',
            border: '1px solid #EAEEF2',
            borderRadius: theme.affine.shape.borderRadius,
        },
    };
});

export const SourceView: FC<Props> = props => {
    const { link, isSelected, block, editorElement } = props;
    const { scene } = useRecastBlockScene();
    const src = formatUrl(link);

    if (src?.startsWith('http')) {
        return (
            <div
                onMouseDown={e => e.preventDefault()}
                style={{ display: 'flex' }}
            >
                <SourceViewContainer isSelected={isSelected} scene={scene}>
                    <iframe
                        title={link}
                        src={src}
                        frameBorder="0"
                        allowFullScreen
                        sandbox="allow-scripts  allow-popups allow-top-navigation-by-user-activation allow-forms allow-same-origin"
                    />
                    <MouseMaskContainer />
                </SourceViewContainer>
            </div>
        );
    } else if (src?.startsWith('affine')) {
        return (
            <SourceViewContainer
                isSelected={isSelected}
                scene={SCENE_CONFIG.REFLINK}
                style={{ padding: '0' }}
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
