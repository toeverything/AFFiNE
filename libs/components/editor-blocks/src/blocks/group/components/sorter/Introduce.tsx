import { styled } from '@toeverything/components/ui';

const StyledIntroduce = styled('div')({
    fontSize: 12,
    color: '#3A4C5C',
});

const Introduce = () => {
    return (
        <StyledIntroduce>
            Sort your items by priority, creation date, price or
            <br />
            any column you have on your board.
        </StyledIntroduce>
    );
};

export { Introduce };
