import { Checkbox } from '@affine/admin/components/ui/checkbox';
import { Label } from '@affine/admin/components/ui/label';
import { Separator } from '@affine/admin/components/ui/separator';
import { Switch } from '@affine/admin/components/ui/switch';
import type { FeatureType } from '@affine/graphql';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback } from 'react';

import { cn } from '../../utils';

type FeatureToggleListProps = {
  features: FeatureType[];
  selected: FeatureType[];
  onChange: (features: FeatureType[]) => void;
  control?: 'checkbox' | 'switch';
  controlPosition?: 'left' | 'right';
  showSeparators?: boolean;
  className?: string;
};

export const FeatureToggleList = ({
  features,
  selected,
  onChange,
  control = 'checkbox',
  controlPosition = 'left',
  showSeparators = false,
  className,
}: FeatureToggleListProps) => {
  const Control = control === 'switch' ? Switch : Checkbox;

  const handleToggle = useCallback(
    (feature: FeatureType, checked: boolean) => {
      if (checked) {
        onChange([...new Set([...selected, feature])]);
      } else {
        onChange(selected.filter(item => item !== feature));
      }
    },
    [onChange, selected]
  );

  if (!features.length) {
    return (
      <div
        className={cn(className, 'px-3 py-2 text-xs')}
        style={{ color: cssVarV2('text/secondary') }}
      >
        No configurable features.
      </div>
    );
  }

  return (
    <div className={className}>
      {features.map((feature, index) => (
        <div key={feature}>
          <Label
            className={cn(
              'cursor-pointer',
              controlPosition === 'right'
                ? 'flex items-center justify-between p-3 text-[15px] gap-2 font-medium leading-6 overflow-hidden'
                : 'flex items-center gap-2 px-3 py-2 text-sm'
            )}
          >
            {controlPosition === 'left' ? (
              <>
                <Control
                  checked={selected.includes(feature)}
                  onCheckedChange={checked => handleToggle(feature, !!checked)}
                />
                <span className="truncate">{feature}</span>
              </>
            ) : (
              <>
                <span className="overflow-hidden text-ellipsis" title={feature}>
                  {feature}
                </span>
                <Control
                  checked={selected.includes(feature)}
                  onCheckedChange={checked => handleToggle(feature, !!checked)}
                />
              </>
            )}
          </Label>
          {showSeparators && index < features.length - 1 && <Separator />}
        </div>
      ))}
    </div>
  );
};
