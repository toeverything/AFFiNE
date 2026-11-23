import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import Zod from 'zod';

import type { TypeInstance, Unify } from './type.js';

const unknownSchema = Zod.unknown();

export class TypeVarDefinitionInstance<
  Name extends string = string,
  Type extends TypeInstance = TypeInstance,
> {
  readonly name = '__TypeVarDefine';

  constructor(
    readonly varName: Name,
    readonly typeConstraint?: Type
  ) {}
}

export class TypeVarReferenceInstance<
  Name extends string = string,
> implements TypeInstance {
  readonly _validate = unknownSchema;

  readonly _valueType = undefined as unknown;

  readonly name = '__TypeVarReference';

  constructor(readonly varName: Name) {}

  subst(ctx: TypeVarContext): void | TypeInstance {
    return ctx[this.varName]?.type;
  }

  unify(_ctx: TypeVarContext, _type: TypeInstance, _unify: Unify): boolean {
    throw new BlockSuiteError(
      ErrorCode.DatabaseBlockError,
      'unexpected type unify, type var reference'
    );
  }

  valueValidate(_value: unknown): _value is unknown {
    return true;
  }
}

export const tv = {
  typeVarDefine: {
    create: <
      Name extends string = string,
      Type extends TypeInstance = TypeInstance,
    >(
      name: Name,
      typeConstraint?: Type
    ) => {
      return new TypeVarDefinitionInstance(name, typeConstraint);
    },
  },
  typeVarReference: {
    create: <Name extends string>(name: Name) => {
      return new TypeVarReferenceInstance(name);
    },
    is: (type: TypeInstance): type is TypeVarReferenceInstance => {
      return type.name === '__TypeVarReference';
    },
  },
};

export type TypeVarDefine = {
  define: TypeVarDefinitionInstance;
  type?: TypeInstance;
};

export type TypeVarContext = Record<string, TypeVarDefine>;
export const tRef = tv.typeVarReference.create;
export const tVar = tv.typeVarDefine.create;
