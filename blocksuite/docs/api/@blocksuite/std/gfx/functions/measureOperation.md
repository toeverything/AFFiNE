[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / measureOperation

# Function: measureOperation()

> **measureOperation**\<`T`\>(`name`, `fn`): `T`

Measure operation cost via Performance API when available.

Marks are always cleared, while measure entries are intentionally retained
so callers can inspect them from Performance tools.

## Type Parameters

### T

`T`

## Parameters

### name

`string`

### fn

() => `T`

## Returns

`T`
