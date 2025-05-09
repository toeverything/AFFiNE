[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [gfx](../README.md) / derive

# Function: derive()

> **derive**\<`V`, `T`\>(`fn`): (`_`, `context`) => `ClassAccessorDecoratorResult`\<`GfxPrimitiveElementModel`\<`BaseElementProps`\>, `V`\>

The derive decorator is used to derive other properties' update when the
decorated property is updated through assignment in the local.

Note:
1. The first argument of the function is the new value of the decorated property
   before the `convert` decorator is called.
2. The decorator function will execute after the decorated property has been updated.
3. The decorator function will not execute during model creation.
4. The decorator function will not execute if the decorated property is updated through
   the Y map. That is to say, if other peers update the property will not trigger this decorator

## Type Parameters

### V

`V`

### T

`T` *extends* `GfxPrimitiveElementModel`\<`BaseElementProps`\>

## Parameters

### fn

(`propValue`, `instance`) => `Record`\<`string`, `unknown`\>

## Returns

> (`_`, `context`): `ClassAccessorDecoratorResult`\<`GfxPrimitiveElementModel`\<`BaseElementProps`\>, `V`\>

### Parameters

#### \_

`unknown`

#### context

`ClassAccessorDecoratorContext`

### Returns

`ClassAccessorDecoratorResult`\<`GfxPrimitiveElementModel`\<`BaseElementProps`\>, `V`\>
