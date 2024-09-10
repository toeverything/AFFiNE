import { cssVarV2 } from '@toeverything/theme/v2';

export const Point = ({
  color,
  size = 8,
}: {
  color: string;
  size?: number;
}) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: `var(${color})`,
        border: `1px solid ${cssVarV2('layer/insideBorder/blackBorder')}`,
      }}
    ></div>
  );
};
