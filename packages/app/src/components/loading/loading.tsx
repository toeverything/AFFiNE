import {
  StyledLoadingWrapper,
  StyledLoading,
  StyledLoadingItem,
} from './styled';

export const Loading = ({ size = 40 }: { size?: number }) => {
  return (
    <StyledLoadingWrapper size={size}>
      <StyledLoading>
        <StyledLoadingItem size={size} />
        <StyledLoadingItem size={size} />
        <StyledLoadingItem size={size} />
        <StyledLoadingItem size={size} />
      </StyledLoading>
    </StyledLoadingWrapper>
  );
};

export default Loading;
