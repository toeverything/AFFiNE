import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import {
  createRef,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import { withUnit } from '../../utils/with-unit';
import * as styles from './styles.css';
import type { RadioItem, RadioProps } from './types';

/**
 * ### Radio button group (Tabs)
 * A tab-like radio button group
 *
 * #### 1. Basic usage with fixed width
 * ```tsx
 * <RadioGroup
 *   width={300}
 *   value={value}
 *   onChange={setValue}
 *   items={['Radio 1', 'Radio 2, Longer', 'S3']}
 *  />
 * ```
 *
 * #### 2. Dynamic width
 * ```tsx
 * <RadioGroup
 *   width="100%"
 *   value={value}
 *   onChange={setValue}
 *   items={['Radio 1', 'Radio 2, Longer', 'S3']}
 * />
 * ```
 *
 * #### 3. `ReactNode` as label
 * ```tsx
 * const [value, setValue] = useState('ai');
 * const items: RadioItem[] = [
 *   {
 *     value: 'ai',
 *     label: <AiIcon width={20} height={20} />,
 *     style: { width: 28 },
 *   },
 *   {
 *     value: 'calendar',
 *     label: <TodayIcon width={20} height={20} />,
 *     style: { width: 28 },
 *   },
 * ];
 * return (
 *   <RadioGroup
 *     value={value}
 *     onChange={setValue}
 *     items={items}
 *     padding={4}
 *     borderRadius={12}
 *     gap={8}
 *   />
 * );
 * ```
 */
export const RadioGroup = memo(function RadioGroup({
  items,
  value,
  width,
  className,
  style,
  padding = 2,
  gap = 4,
  borderRadius = 10,
  itemHeight = 28,
  animationDuration = 250,
  animationEasing = 'cubic-bezier(.18,.22,0,1)',
  activeItemClassName,
  activeItemStyle,
  indicatorClassName,
  indicatorStyle,
  iconMode,
  onChange,
  disabled,
}: RadioProps) {
  const animationTImerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalItems = useMemo(() => {
    return items
      .map(value =>
        typeof value === 'string' ? ({ value } as RadioItem) : value
      )
      .map(item => ({
        ...item,
        ref: createRef<HTMLButtonElement>(),
        indicatorRef: createRef<HTMLDivElement>(),
      }));
  }, [items]);
  const finalStyle = useMemo(
    () => ({
      width,
      ...style,
      ...assignInlineVars({
        [styles.outerPadding]: withUnit(padding, 'px'),
        [styles.outerRadius]: withUnit(borderRadius, 'px'),
        [styles.itemGap]: withUnit(gap, 'px'),
        [styles.itemHeight]: withUnit(itemHeight, 'px'),
      }),
    }),
    [width, style, padding, borderRadius, gap, itemHeight]
  );

  const animate = useCallback(
    (oldValue?: string, newValue?: string) => {
      if (!oldValue || !newValue) return;
      const oldItem = finalItems.find(item => item.value === oldValue);
      const newItem = finalItems.find(item => item.value === newValue);
      if (!oldItem || !newItem) return;
      const oldRect = oldItem.ref.current?.getBoundingClientRect();
      const newRect = newItem.ref.current?.getBoundingClientRect();
      if (!oldRect || !newRect) return;
      const activeIndicator = newItem.indicatorRef.current;
      if (!activeIndicator) return;

      activeIndicator.style.transform = `translate3d(${oldRect.left - newRect.left}px,0,0)`;
      activeIndicator.style.transition = 'none';
      activeIndicator.style.width = `${oldRect.width}px`;

      const animation = `${withUnit(animationDuration, 'ms')} ${animationEasing}`;

      if (animationTImerRef.current) clearTimeout(animationTImerRef.current);
      animationTImerRef.current = setTimeout(() => {
        animationTImerRef.current = null;
        activeIndicator.style.transition = `transform ${animation}, width ${animation}`;
        activeIndicator.style.transform = 'none';
        activeIndicator.style.width = '';
      }, 50);
    },
    [animationDuration, animationEasing, finalItems]
  );

  // animate on value change
  // useEffect: in case that value is changed from outside
  const prevValue = useRef(value);
  useEffect(() => {
    const currentValue = value;
    const previousValue = prevValue.current;
    if (currentValue !== previousValue) {
      animate(previousValue, currentValue);
      prevValue.current = currentValue;
    }
  }, [animate, value]);

  return (
    <RadixRadioGroup.Root
      value={value}
      onValueChange={onChange}
      className={clsx(styles.radioButtonGroup, className)}
      style={finalStyle}
      data-icon-mode={iconMode}
      disabled={disabled}
    >
      {finalItems.map(({ customRender, ...item }, index) => {
        const testId = item.testId ? { 'data-testid': item.testId } : {};
        const active = item.value === value;

        const classMap = { [styles.radioButton]: true };
        if (activeItemClassName) classMap[activeItemClassName] = active;
        if (item.className) classMap[item.className] = true;

        const style = { ...item.style };
        if (activeItemStyle && active) Object.assign(style, activeItemStyle);

        return (
          <RadixRadioGroup.Item
            ref={item.ref}
            key={item.value}
            value={item.value}
            className={clsx(classMap)}
            style={style}
            {...testId}
            {...item.attrs}
            disabled={disabled}
          >
            <RadixRadioGroup.Indicator
              forceMount
              className={clsx(styles.indicator, indicatorClassName)}
              ref={item.indicatorRef}
              style={indicatorStyle}
            />
            <span className={styles.radioButtonContent}>
              {customRender?.(item, index) ?? item.label ?? item.value}
            </span>
          </RadixRadioGroup.Item>
        );
      })}
    </RadixRadioGroup.Root>
  );
});
