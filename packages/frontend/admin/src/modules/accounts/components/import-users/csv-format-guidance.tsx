import { WarningIcon } from '@blocksuite/icons/rc';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import type { FC } from 'react';

interface CsvFormatGuidanceProps {
  passwordLimits: {
    minLength: number;
    maxLength: number;
  };
}

/**
 * Component that displays CSV format guidelines
 */
export const CsvFormatGuidance: FC<CsvFormatGuidanceProps> = ({
  passwordLimits,
}) => {
  return (
    <div
      className="flex p-1.5 gap-1 rounded-[6px]"
      style={{
        fontSize: cssVar('fontXs'),
        color: cssVarV2('text/secondary'),
        backgroundColor: cssVarV2('layer/background/secondary'),
      }}
    >
      <div className="flex justify-center py-0.5">
        <WarningIcon fontSize={16} color={cssVarV2('icon/primary')} />
      </div>
      <div>
        <p>CSV file includes username, email, and password.</p>
        <ul>
          {[
            `Username (optional): any text.`,
            `Email (required): e.g., user@example.com.`,
            `Password (optional): ${passwordLimits.minLength}–${passwordLimits.maxLength} characters.`,
          ].map((text, index) => (
            <li
              key={`guidance-${index}`}
              className="relative pl-2 leading-normal"
            >
              <span className="absolute left-0 top-2 w-1 h-1 rounded-full bg-current" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
