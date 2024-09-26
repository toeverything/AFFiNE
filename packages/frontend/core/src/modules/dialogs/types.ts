export type OpenedDialog<T> = {
  [key in keyof T]: {
    type: key;
    props: DialogProps<T>;
    callback: (result?: DialogResult<T>) => void;
  };
}[keyof T] & { id: string };

export type DialogProps<T> = T extends (props: infer P) => void ? P : undefined;
export type DialogResult<T> = T extends () => infer R ? R : undefined;
