import { styled } from '@toeverything/components/ui';

import type { SvgIconProps } from '@toeverything/components/ui';

interface Props {
    Icon: (prop: SvgIconProps) => JSX.Element;
    text?: string;
    onClick: () => void;
}

const StyledAddSort = styled('div')({
    display: 'flex',
    alignItems: 'center',
    padding: '6px 8px',
    '& svg': {
        marginRight: 4,
    },
    fontSize: 12,
    color: '#3A4C5C',
});

const IconBtn = (props: Props) => {
    const { Icon, text, onClick } = props;

    return (
        <StyledAddSort onClick={onClick}>
            <Icon fontSize="small" />
            <span>{text}</span>
        </StyledAddSort>
    );
};

export { IconBtn };
