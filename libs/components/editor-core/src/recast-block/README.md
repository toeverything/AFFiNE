# Recast Block

# What's Recast block?

A recast block is a block that can be recast into other forms, such as list, kanban, table, and so on.

But now, we only have List and Kanban implementation.

Every recast block has some Property also call it "Meta Data"

# Usage

**In most cases, you do not need to use recast block API directly.**

## Context

-   `RecastBlockProvider` and `withRecastBlock`

```tsx
const RecastComponent = () => {
  return (
    <RecastBlockProvider>
      <SomeBlock />
    </RecastBlockProvider>
  );

// or

const RecastComponent = withRecastBlock(SomeBlock);
```

## Meta Data

```tsx
const SomeBlock = () => {
    const {
        // Get meta data
        getProperty,
        // Get all meta data
        getProperties,
        // Set meta data
        addProperty,
        // Update meta data
        updateProperty,
        // Remove meta data
        removeProperty,
    } = useRecastBlockMeta();

    return <div>...</div>;
};
```
