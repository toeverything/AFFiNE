import { FC } from 'react';
import { SvgIcon, SvgIconProps } from '@mui/material';
/**
 * @deprecated Please use the icon from @toeverything/components/ui. If it does not exist, contact the designer to add。
 */
export const HighlighterDuotoneIcon: FC<SvgIconProps> = props => (
    <SvgIcon {...props}>
        <path
            style={{ fill: 'var(--color-0)' }}
            d="M6 15.004H18V17.003999999999998H6z"
        />
        <path
            style={{ fill: 'var(--color-1)' }}
            d="m7.656 16.445 2.908-.825 6.772-5.197a1.905 1.905 0 0 0 .287-2.624 1.938 1.938 0 0 0-1.189-.767 1.698 1.698 0 0 0-1.363.316l-6.75 5.197-1.594 2.624-.7.566.937 1.269.692-.56Zm8.163-8.08a.49.49 0 0 1 .385-.078.65.65 0 0 1 .412.28.612.612 0 0 1-.042.838l-6.57 5.018-.503.144-.524-.717.273-.452 6.57-5.032Z"
        />
    </SvgIcon>
);
