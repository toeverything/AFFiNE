import { styled } from '../styled';

export const StyledTag = styled('div')`
    height: 20px;
    display: inline-flex;
    align-items: center;
    border-radius: 11px;
    padding: 0 8px;
    font-size: 12px;
    cursor: pointer;
    position: relative;

    .affine-tag__wrapper {
        display: flex;
        align-items: center;
        align-content: center;
    }
    .affine-tag__content {
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 20px;
        flex-grow: 1;
    }

    .affine-tag__closeWrapper {
        height: 100%;
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        margin: auto;
        display: flex;
        align-items: center;
        padding: 0 5px;
        opacity: 0;
        transition: opacity 0.15s;
        pointer-events: none;
    }

    &.affine-tag--closeable {
        &:hover {
            .affine-tag__wrapper {
                width: calc(100% - 8px);
            }
            .affine-tag__closeWrapper {
                opacity: 1;
                pointer-events: auto;
            }
        }
    }
`;
