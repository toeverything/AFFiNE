import { styled } from '@toeverything/components/ui';
import {
    ChangeEvent,
    KeyboardEventHandler,
    useCallback,
    useState,
} from 'react';

export const ReplyInput = (props: any) => {
    const { onSubmit } = props;
    const [value, setValue] = useState('');

    const onKeyDown: KeyboardEventHandler<HTMLInputElement> = e => {
        if (!e.metaKey && !e.shiftKey && e.code === 'Enter' && value) {
            onSubmit && onSubmit(value);
            setValue('');
        }
    };

    const handleInputChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            setValue(e.target.value.trim());
        },
        []
    );

    return (
        <StyledContainerForReplyInput className="affine-comment-reply-input">
            <input
                type="text"
                placeholder={'reply...'}
                onKeyDown={onKeyDown}
                onChange={handleInputChange}
                value={value}
            />
        </StyledContainerForReplyInput>
    );
};

const StyledContainerForReplyInput = styled('div')(({ theme }) => {
    return {
        // marginTop: theme.affine.spacing.xsSpacing,
        marginTop: 8,
    };
});
