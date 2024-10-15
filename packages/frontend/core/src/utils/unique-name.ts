export const generateUniqueNameInSequence = (
  baseName: string,
  existingNames: string[]
): string => {
  if (!existingNames.includes(baseName)) {
    return baseName;
  }

  const numericSuffix = baseName.match(/(\d+)$/);
  if (numericSuffix) {
    const currentNumber = parseInt(numericSuffix[1], 10);
    const newName = baseName.replace(/\d+$/, (currentNumber + 1).toString());
    return generateUniqueNameInSequence(newName, existingNames);
  }

  return generateUniqueNameInSequence(`${baseName} 2`, existingNames);
};
