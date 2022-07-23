import { FC, memo, useEffect, useMemo, useRef, useState } from 'react';

import { StyledBlockPreview } from '@toeverything/components/common';
import { styled } from '@toeverything/components/ui';
import { AsyncBlock, useRecastBlockScene } from '@toeverything/framework/virgo';

import { formatUrl } from './format-url';
import { SCENE_CONFIG } from '../../blocks/group/config';
import { services } from '@toeverything/datasource/db-service';
import { debounce } from '@toeverything/utils';
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

type BlockPreviewProps = {
    block: AsyncBlock;
    blockId: string;
    editorElement?: () => JSX.Element;
};

const BlockPreview = (props: BlockPreviewProps) => {
    const container = useRef<HTMLDivElement>();
    const [preview, setPreview] = useState(true);
    const [title, setTitle] = useState('Loading...');
    useEffect(() => {
        let callback: any = undefined;
        services.api.editorBlock
            .getBlock(props.block.workspace, props.blockId)
            .then(block => {
                if (block.id === props.blockId) {
                    const updateTitle = debounce(
                        async () => {
                            const [page] =
                                await services.api.editorBlock.search(
                                    props.block.workspace,
                                    { tag: 'id:affine67Uz4DstDk6PKUbz' }
                                );

                            console.log(page);
                            setTitle(page?.content || 'Untitled');
                        },
                        100,
                        { maxWait: 500 }
                    );
                    block.on('content', props.block.id, updateTitle);
                    callback = () => block.off('content', props.block.id);
                    updateTitle();
                } else {
                    setTitle('Untitled');
                }
            });
        return () => callback?.();
    }, [props.block.id, props.block.workspace, props.blockId]);

    const AffineEditor = props.editorElement as any;

    useEffect(() => {
        if (container?.current) {
            const element = container?.current;
            const resizeObserver = new IntersectionObserver(entries => {
                const height = entries?.[0]?.intersectionRect.height;
                setPreview(height < 174);
            });

            resizeObserver.observe(element);
            return () => resizeObserver.unobserve(element);
        }
        return undefined;
    }, [container]);

    return (
        <div ref={container}>
            <StyledBlockPreview title={title}>
                {preview ? (
                    <span
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            fontSize: '128px',
                            height: '480px',
                            alignItems: 'center',
                            color: '#5591ff',
                        }}
                    >
                        Preview
                    </span>
                ) : AffineEditor ? (
                    <AffineEditor
                        workspace={props.block.workspace}
                        rootBlockId={props.blockId}
                    />
                ) : null}
            </StyledBlockPreview>
        </div>
    );
};

const MemoBlockPreview = memo(BlockPreview, (prev, next) => {
    return (
        prev.block.workspace === next.block.workspace &&
        prev.blockId === next.blockId
    );
});

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
                <MemoBlockPreview
                    block={block}
                    editorElement={editorElement}
                    blockId={src}
                />
            </SourceViewContainer>
        );
    }
    return null;
};
