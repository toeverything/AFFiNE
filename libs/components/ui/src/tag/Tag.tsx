import type {
    FC,
    ChangeEventHandler,
    PropsWithChildren,
    CSSProperties,
    ReactNode,
} from 'react';

import { MouseEventHandler } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { StyledTag } from './style';

export interface TagProps {
    style?: CSSProperties;
    onClick?: MouseEventHandler;
    closeable?: boolean;
    onClose?: () => void;
    startElement?: ReactNode;
    endElement?: ReactNode;
}

export const Tag = ({
    onClick,
    style,
    children,
    closeable,
    onClose,
    startElement,
    endElement,
}: PropsWithChildren<TagProps>) => {
    return (
        <StyledTag
            className={`affine-tag ${closeable ? 'affine-tag--closeable' : ''}`}
            style={{
                ...style,
            }}
            onClick={onClick}
        >
            <div className="affine-tag__wrapper">
                {startElement}
                <div className="affine-tag__content">{children}</div>
                {endElement}
                {closeable && (
                    <div
                        className="affine-tag__closeWrapper"
                        onClick={e => {
                            e.stopPropagation();
                            onClose?.();
                        }}
                    >
                        <CloseIcon style={{ fontSize: 12 }} />
                    </div>
                )}
            </div>
        </StyledTag>
    );
};
