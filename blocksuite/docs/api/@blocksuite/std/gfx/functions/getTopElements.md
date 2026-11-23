[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / getTopElements

# Function: getTopElements()

> **getTopElements**(`elements`): `GfxModel`[]

Get the top elements from the list of elements, which are in some tree structures.

For example: a list `[G1, E1, G2, E2, E3, E4, G4, E5, E6]`,
and they are in the elements tree like:
```
    G1         G4      E6
   /  \        |
 E1   G2       E5
      / \
     E2  G3*
        / \
       E3 E4
```
where the star symbol `*` denote it is not in the list.

The result should be `[G1, G4, E6]`

## Parameters

### elements

`GfxModel`[]

## Returns

`GfxModel`[]
