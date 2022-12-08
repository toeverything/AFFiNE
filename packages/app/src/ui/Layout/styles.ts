import { styled, textEllipsis } from '@/styles';
import { WrapperProps } from './wrapper';
import { ContentProps } from '@/ui/Layout/content';

export const StyledWrapper = styled.div<WrapperProps>(
  ({
    display,
    justifyContent,
    alignItems,
    flexWrap,
    flexDirection,
    flexShrink,
    flexGrow,
  }) => {
    return {
      display,
      justifyContent,
      alignItems,
      flexWrap,
      flexDirection,
      flexShrink,
      flexGrow,
    };
  }
);

export const StyledContent = styled.div<ContentProps>(
  ({
    theme,
    color,
    fontSize,
    fontWeight,
    lineHeight,
    ellipsis,
    lineNum,
    width,
    maxWidth,
  }) => {
    return {
      width,
      maxWidth,
      display: 'inline-block',
      color: color ?? theme.colors.textColor,
      fontSize: fontSize ?? theme.font.base,
      fontWeight: fontWeight ?? 400,
      lineHeight: lineHeight ?? 1.5,
      ...(ellipsis ? textEllipsis(lineNum) : {}),
    };
  }
);
