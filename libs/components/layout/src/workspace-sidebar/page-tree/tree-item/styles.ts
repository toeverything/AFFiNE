import { styled } from '@toeverything/components/ui';
import { Link } from 'react-router-dom';

export const TreeItemContainer = styled('div')`
    box-sizing: border-box;
    display: flex;
    align-items: center;
    color: #4c6275;
`;

export const Wrapper = styled('li')<{
    spacing: string;
    clone?: boolean;
    ghost?: boolean;
    indicator?: boolean;
    disableSelection?: boolean;
    disableInteraction?: boolean;
}>`
    box-sizing: border-box;
    padding-left: ${({ spacing }) => spacing};
    list-style: none;
    font-size: 14px;

    ${({ clone, disableSelection }) =>
        (clone || disableSelection) &&
        `width: 100%;
        .Text,
        .Count {
            user-select: none;
            -webkit-user-select: none;
        }`}

    ${({ indicator }) =>
        indicator &&
        `width: 100%;
        .Text,
        .Count {
            user-select: none;
            -webkit-user-select: none;
        }`}

    ${({ disableInteraction }) => disableInteraction && `pointer-events: none;`}

    &:hover {
        background: #f5f7f8;
        border-radius: 5px;
    }

    &.clone {
        display: inline-block;
        padding: 0;
        margin-left: 10px;
        margin-top: 5px;
        pointer-events: none;

        ${TreeItemContainer} {
            padding-right: 20px;
            border-radius: 4px;
            box-shadow: 0px 15px 15px 0 rgba(34, 33, 81, 0.1);
        }
    }

    &.ghost {
        &.indicator {
            opacity: 1;
            position: relative;
            z-index: 1;
            margin-bottom: -1px;

            ${TreeItemContainer} {
                position: relative;
                padding: 0;
                height: 8px;
                border-color: #2389ff;
                background-color: #56a1f8;

                &:before {
                    position: absolute;
                    left: -8px;
                    top: -4px;
                    display: block;
                    content: '';
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    border: 1px solid #2389ff;
                }

                > * {
                    /* Items are hidden using height and opacity to retain focus */
                    opacity: 0;
                    height: 0;
                }
            }
        }

        &:not(.indicator) {
            opacity: 0.5;
        }

        ${TreeItemContainer} > * {
            box-shadow: none;
            background-color: transparent;
        }
    }
`;

export const Counter = styled('span')`
    position: absolute;
    top: 8px;
    right: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: #2389ff;
    font-size: 0.9rem;
    font-weight: 500;
    color: #fff;
`;

export const ActionButton = styled('button')<{
    background?: string;
    fill?: string;
}>`
    display: flex;
    width: 12px;
    padding: 0 15px;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    touch-action: none;
    cursor: pointer;
    border-radius: 5px;
    border: none;
    outline: none;
    appearance: none;
    background-color: transparent;
    -webkit-tap-highlight-color: transparent;

    svg {
        flex: 0 0 auto;
        margin: auto;
        height: 100%;
        overflow: visible;
        fill: #919eab;
    }

    &:active {
        background-color: ${({ background }) =>
            background ?? 'rgba(0, 0, 0, 0.05)'};

        svg {
            fill: ${({ fill }) => fill ?? '#788491'};
        }
    }

    &:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0), 0 0px 0px 2px #4c9ffe;
    }
`;

export const TreeItemMoreActions = styled('div')`
    display: block;
    visibility: hidden;
`;

export const TextLink = styled(Link, {
    shouldForwardProp: (prop: string) => !['active'].includes(prop),
})<{ active?: boolean }>`
    display: flex;
    align-items: center;
    flex-grow: 1;
    height: 100%;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    cursor: pointer;
    appearance: none;
    text-decoration: none;
    user-select: none;
    color: ${({ theme, active }) =>
        active ? theme.affine.palette.primary : 'unset'};
`;

export const TreeItemContent = styled('div')`
    box-sizing: border-box;
    width: 100%;
    height: 32px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-around;
    color: #4c6275;
    padding-right: 0.5rem;
    overflow: hidden;

    &:hover {
        ${TreeItemMoreActions} {
            visibility: visible;
            cursor: pointer;
        }
    }
`;
