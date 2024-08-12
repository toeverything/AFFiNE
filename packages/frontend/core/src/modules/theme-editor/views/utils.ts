export const variableNameToParts = (name: string) => name.slice(9).split('-');

export const partsToVariableName = (parts: string[]) =>
  `--affine-${parts.join('-')}`;

export const isColor = (value: string) => {
  return value.startsWith('#') || value.startsWith('rgb');
};
