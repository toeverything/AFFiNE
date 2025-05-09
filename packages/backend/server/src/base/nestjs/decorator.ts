export function makeMethodDecorator<
  T extends any[],
  Fn extends (...args: any[]) => any,
>(
  decorator: (...args: T) => (target: any, key: string | symbol, fn: Fn) => Fn
) {
  return (...args: T) => {
    return (
      target: any,
      key: string | symbol,
      desc: TypedPropertyDescriptor<any>
    ) => {
      const originalFn = desc.value;
      if (!originalFn || typeof originalFn !== 'function') {
        throw new Error(
          `MethodDecorator must be applied to a function but got ${typeof originalFn}`
        );
      }

      const decoratedFn = decorator(...args)(target, key, originalFn);
      desc.value = decoratedFn;
      return desc;
    };
  };
}

export function PushMetadata<T>(key: string | symbol, value: T) {
  const decorator: ClassDecorator | MethodDecorator = (
    target,
    _,
    descriptor
  ) => {
    const metadataTarget = descriptor?.value ?? target;

    const metadataArray = Reflect.getMetadata(key, metadataTarget) || [];
    metadataArray.push(value);
    Reflect.defineMetadata(key, metadataArray, metadataTarget);
  };

  return decorator;
}

export function sliceMetadata<T>(key: string | symbol, target: any): T[] {
  return Reflect.getMetadata(key, target) || [];
}
