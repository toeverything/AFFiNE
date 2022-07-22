import { useState, type ReactNode } from 'react';
import { styled, MuiClickAwayListener } from '@toeverything/components/ui';

type TextWithCommentsProps = {
    commentsIds: string[];
    isActive?: boolean;
    children?: ReactNode;
    [p: string]: unknown;
};

export const TextWithComments = (props: TextWithCommentsProps) => {
    const { children, ...restProps } = props;
    // const [isActive, setIsActive] = useState(false);
    // console.log(';; isActive ', isActive, props.commentsIds);

    return <StyledText {...restProps}>{children}</StyledText>;

    // return props.commentsIds.length > 0 ? (
    //     <MuiClickAwayListener
    //         onClickAway={() => {
    //             setIsActive(false);
    //         }}
    //     >
    //         <StyledText
    //             isActive={isActive}
    //             onClick={() => {
    //                 setIsActive(true);
    //             }}
    //             {...restProps}
    //         >
    //             {children}
    //         </StyledText>
    //     </MuiClickAwayListener>
    // ) : (
    //     <StyledText {...restProps}>{children}</StyledText>
    // );
};

const StyledText = styled('span', {
    shouldForwardProp: (prop: string) =>
        !['commentsIds', 'isActive'].includes(prop),
})<TextWithCommentsProps>(({ theme, commentsIds, isActive }) => {
    return {
        width: 20,
        height: 20,
        // color: '',
        backgroundColor:
            commentsIds.length > 1
                ? 'rgba(19, 217, 227, 0.4)'
                : commentsIds.length === 1
                ? 'rgba(19, 217, 227, 0.2)'
                : '',
        border: isActive ? '2px solid rgba(19, 217, 227, 0.3)' : '',
    };
});
