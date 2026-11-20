type PaletteMemory = {
  index: number;
  activeKey?: string;
};

const TOOL_PALETTE_MEMORY = new Map<string, PaletteMemory>();

export function getToolPaletteMemory(key: string): PaletteMemory {
  return TOOL_PALETTE_MEMORY.get(key) ?? { index: 0 };
}

export function setToolPaletteMemory(key: string, memory: PaletteMemory) {
  TOOL_PALETTE_MEMORY.set(key, memory);
}
