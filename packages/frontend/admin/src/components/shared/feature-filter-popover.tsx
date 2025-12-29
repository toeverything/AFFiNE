import { Button } from '@affine/admin/components/ui/button';
import { Checkbox } from '@affine/admin/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@affine/admin/components/ui/popover';
import type { FeatureType } from '@affine/graphql';
import { useCallback } from 'react';

type FeatureFilterPopoverProps = {
  selectedFeatures: FeatureType[];
  availableFeatures: FeatureType[];
  onChange: (features: FeatureType[]) => void;
  align?: 'start' | 'center' | 'end';
  buttonLabel?: string;
};

export const FeatureFilterPopover = ({
  selectedFeatures,
  availableFeatures,
  onChange,
  align = 'start',
  buttonLabel = 'Features',
}: FeatureFilterPopoverProps) => {
  const handleFeatureToggle = useCallback(
    (feature: FeatureType, checked: boolean) => {
      if (checked) {
        onChange([...new Set([...selectedFeatures, feature])]);
      } else {
        onChange(selectedFeatures.filter(enabled => enabled !== feature));
      }
    },
    [onChange, selectedFeatures]
  );

  const handleClearFeatures = useCallback(() => {
    onChange([]);
  }, [onChange]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2 lg:px-3 space-x-1"
        >
          <span>{buttonLabel}</span>
          {selectedFeatures.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              ({selectedFeatures.length})
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-[240px] p-2 flex flex-col gap-2"
      >
        <div className="text-xs font-medium px-1">Filter by feature</div>
        <div className="flex flex-col gap-1 max-h-64 overflow-auto">
          {availableFeatures.map(feature => (
            <label
              key={feature}
              className="flex items-center gap-2 px-1 py-1.5 cursor-pointer"
            >
              <Checkbox
                checked={selectedFeatures.includes(feature)}
                onCheckedChange={checked =>
                  handleFeatureToggle(feature, !!checked)
                }
              />
              <span className="text-sm truncate">{feature}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFeatures}
            disabled={selectedFeatures.length === 0}
          >
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
