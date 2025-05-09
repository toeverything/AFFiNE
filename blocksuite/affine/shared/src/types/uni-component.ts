export type ExposeWrapper<
  Expose extends NonNullable<unknown> = NonNullable<unknown>,
> = (value?: Expose) => void;
export type UniComponentReturn<Props = NonNullable<unknown>> = {
  update: (props: Props) => void;
  unmount: () => void;
};
export type UniComponent<
  Props = NonNullable<unknown>,
  Expose extends NonNullable<unknown> = NonNullable<unknown>,
> = (
  ele: HTMLElement,
  props: Props,
  expose: ExposeWrapper<Expose>
) => UniComponentReturn<Props>;
