export const lazy = <T>(fn: () => T): { value: T } => {
  let data: { value: T } | undefined;
  return {
    get value() {
      if (!data) {
        data = { value: fn() };
      }
      return data.value;
    },
  };
};
