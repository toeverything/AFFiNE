[**BlockSuite API Documentation**](../../../README.md)

***

[BlockSuite API Documentation](../../../README.md) / [@blocksuite/store](../README.md) / Schema

# Class: Schema

Represents a schema manager for block flavours and their relationships.
Provides methods to register, validate, and query block schemas.

## Properties

### flavourSchemaMap

> `readonly` **flavourSchemaMap**: `Map`\<`string`, \{ `model`: \{ `children?`: `string`[]; `flavour`: `string`; `isFlatData?`: `boolean`; `parent?`: `string`[]; `props?`: (...`args`) => `Record`\<`string`, `any`\>; `role`: `string`; `toModel?`: (...`args`) => `BlockModel`\<`object`\>; \}; `transformer?`: (...`args`) => `BaseBlockTransformer`\<`object`\>; `version`: `number`; \}\>

A map storing block flavour names to their corresponding schema definitions.

## Accessors

### versions

#### Get Signature

> **get** **versions**(): `object`

Returns an object mapping each registered flavour to its version number.

##### Returns

`object`

## Methods

### get()

> **get**(`flavour`): \{ `model`: \{ `children?`: `string`[]; `flavour`: `string`; `isFlatData?`: `boolean`; `parent?`: `string`[]; `props?`: (...`args`) => `Record`\<`string`, `any`\>; `role`: `string`; `toModel?`: (...`args`) => `BlockModel`\<`object`\>; \}; `transformer?`: (...`args`) => `BaseBlockTransformer`\<`object`\>; `version`: `number`; \} \| `undefined`

Retrieves the schema for a given block flavour.

#### Parameters

##### flavour

`string`

The block flavour name.

#### Returns

\{ `model`: \{ `children?`: `string`[]; `flavour`: `string`; `isFlatData?`: `boolean`; `parent?`: `string`[]; `props?`: (...`args`) => `Record`\<`string`, `any`\>; `role`: `string`; `toModel?`: (...`args`) => `BlockModel`\<`object`\>; \}; `transformer?`: (...`args`) => `BaseBlockTransformer`\<`object`\>; `version`: `number`; \} \| `undefined`

The corresponding BlockSchemaType or undefined if not found.

***

### isValid()

> **isValid**(`child`, `parent`): `boolean`

Checks if the child flavour is valid under the parent flavour.

#### Parameters

##### child

`string`

The child block flavour name.

##### parent

`string`

The parent block flavour name.

#### Returns

`boolean`

True if the relationship is valid, false otherwise.

***

### register()

> **register**(`blockSchema`): `Schema`

Registers an array of block schemas into the schema manager.

#### Parameters

##### blockSchema

`object`[]

An array of block schema definitions to register.

#### Returns

`Schema`

The Schema instance (for chaining).

***

### safeValidate()

> **safeValidate**(`flavour`, `parentFlavour?`, `childFlavours?`): `boolean`

Safely validates the schema relationship for a given flavour, parent, and children.
Returns true if valid, false otherwise (does not throw).

#### Parameters

##### flavour

`string`

The block flavour to validate.

##### parentFlavour?

`string`

The parent block flavour (optional).

##### childFlavours?

`string`[]

The child block flavours (optional).

#### Returns

`boolean`

True if the schema relationship is valid, false otherwise.

***

### toJSON()

> **toJSON**(): `object`

Serializes the schema map to a plain object for JSON output.

#### Returns

`object`

An object mapping each flavour to its role, parent, and children.

***

### validate()

> **validate**(`flavour`, `parentFlavour?`, `childFlavours?`): `void`

Validates the schema relationship for a given flavour, parent, and children.
Throws SchemaValidateError if invalid.

#### Parameters

##### flavour

`string`

The block flavour to validate.

##### parentFlavour?

`string`

The parent block flavour (optional).

##### childFlavours?

`string`[]

The child block flavours (optional).

#### Returns

`void`

#### Throws

If the schema relationship is invalid.

***

### validateSchema()

> **validateSchema**(`child`, `parent`): `void`

Validates the relationship between a child and parent schema.
Throws if the relationship is invalid.

#### Parameters

##### child

The child block schema.

###### model

\{ `children?`: `string`[]; `flavour`: `string`; `isFlatData?`: `boolean`; `parent?`: `string`[]; `props?`: (...`args`) => `Record`\<`string`, `any`\>; `role`: `string`; `toModel?`: (...`args`) => `BlockModel`\<`object`\>; \} = `...`

###### model.children?

`string`[] = `ContentSchema`

###### model.flavour

`string` = `FlavourSchema`

###### model.isFlatData?

`boolean` = `...`

###### model.parent?

`string`[] = `ParentSchema`

###### model.props?

(...`args`) => `Record`\<`string`, `any`\> = `...`

###### model.role

`string` = `RoleSchema`

###### model.toModel?

(...`args`) => `BlockModel`\<`object`\> = `...`

###### transformer?

(...`args`) => `BaseBlockTransformer`\<`object`\> = `...`

###### version

`number` = `...`

##### parent

The parent block schema.

###### model

\{ `children?`: `string`[]; `flavour`: `string`; `isFlatData?`: `boolean`; `parent?`: `string`[]; `props?`: (...`args`) => `Record`\<`string`, `any`\>; `role`: `string`; `toModel?`: (...`args`) => `BlockModel`\<`object`\>; \} = `...`

###### model.children?

`string`[] = `ContentSchema`

###### model.flavour

`string` = `FlavourSchema`

###### model.isFlatData?

`boolean` = `...`

###### model.parent?

`string`[] = `ParentSchema`

###### model.props?

(...`args`) => `Record`\<`string`, `any`\> = `...`

###### model.role

`string` = `RoleSchema`

###### model.toModel?

(...`args`) => `BlockModel`\<`object`\> = `...`

###### transformer?

(...`args`) => `BaseBlockTransformer`\<`object`\> = `...`

###### version

`number` = `...`

#### Returns

`void`

#### Throws

If the relationship is invalid.
