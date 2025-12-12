[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / generateNKeysBetween

# Function: generateNKeysBetween()

> **generateNKeysBetween**(`a`, `b`, `n`, `digits?`): `string`[]

same preconditions as generateKeysBetween.
n >= 0.
Returns an array of n distinct keys in sorted order.
If a and b are both null, returns [a0, a1, ...]
If one or the other is null, returns consecutive "integer"
keys.  Otherwise, returns relatively short keys between
a and b.

## Parameters

### a

`string` | `null` | `undefined`

### b

`string` | `null` | `undefined`

### n

`number`

### digits?

`string`

## Returns

`string`[]
