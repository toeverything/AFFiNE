import { styled } from '@toeverything/components/ui';
import { Link } from 'react-router-dom';

export const TreeItemContainer = styled('div')<{
    spacing: string;
    clone?: boolean;
    ghost?: boolean;
    disableSelection?: boolean;
    disableInteraction?: boolean;
    active?: boolean;
}>`
    display: flex;
    align-items: center;
    color: #4c6275;

    box-sizing: border-box;
    padding-left: ${({ spacing }) => spacing};
    list-style: none;
    font-size: 14px;
    background-color: ${({ active }) => (active ? '#f5f7f8' : 'transparent')};
    border-radius: 5px;

    ${({ clone, disableSelection }) =>
        (clone || disableSelection) &&
        `
        width: 100%;
        user-select: none;
        opacity: 0.7;
        background: transparent;
        cursor: grab;
    `}

    ${({ disableInteraction }) => disableInteraction && `pointer-events: none;`}

    &:hover {
        background: #f5f7f8;
        border-radius: 5px;
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
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    touch-action: none;
    cursor: pointer;
    border-radius: 5px;
    border: none;
    outline: none;
    appearance: none;
    background: transparent;
    -webkit-tap-highlight-color: transparent;

    svg {
        width: 20px;
        height: 20px;
        flex: 0 0 auto;
        margin: auto;
        overflow: visible;
        fill: #919eab;
    }

    &:active {
        background: ${({ background }) => background ?? 'rgba(0, 0, 0, 0.05)'};

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

export const TextLink = styled(Link)`
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
    color: #4c6275;
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
    padding-right: 12px;
    overflow: hidden;

    &:hover {
        ${TreeItemMoreActions} {
            visibility: visible;
            cursor: pointer;
        }
    }
`;
