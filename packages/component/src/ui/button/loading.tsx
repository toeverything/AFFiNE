import { styled } from '../../styles';
import type { ButtonProps } from './interface';
import { getButtonColors } from './utils';
export const LoadingContainer = styled('div')<Pick<ButtonProps, 'type'>>(({
  theme,
  type = 'default',
}) => {
  const { color } = getButtonColors(theme, type, false);
  return `
    margin: 0px auto;
    width: 38px;
    text-align: center;
    .load {
        width: 8px;
        height: 8px;
        background-color: ${color};

        border-radius: 100%;
        display: inline-block;
        -webkit-animation: bouncedelay 1.4s infinite ease-in-out;
        animation: bouncedelay 1.4s infinite ease-in-out;
        /* Prevent first frame from flickering when animation starts */
        -webkit-animation-fill-mode: both;
        animation-fill-mode: both;
    }
    .load1 {
        -webkit-animation-delay: -0.32s;
        animation-delay: -0.32s;
    }
    .load2 {
        -webkit-animation-delay: -0.16s;
        animation-delay: -0.16s;
    }

    @-webkit-keyframes bouncedelay {
      0%, 80%, 100% { -webkit-transform: scale(0) }
      40% { -webkit-transform: scale(1.0) }
    }

    @keyframes bouncedelay {
      0%, 80%, 100% {
        transform: scale(0);
        -webkit-transform: scale(0);
      } 40% {
        transform: scale(1.0);
        -webkit-transform: scale(1.0);
      }
    }
  `;
});

export const Loading = ({ type }: Pick<ButtonProps, 'type'>) => {
  return (
    <LoadingContainer type={type} className="load-container">
      <div className="load load1"></div>
      <div className="load load2"></div>
      <div className="load"></div>
    </LoadingContainer>
  );
};
