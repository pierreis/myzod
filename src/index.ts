abstract class Type<T> {
  constructor() {}
  abstract parse(value: unknown): T;
  optional(): UnionType<[Type<T>, UndefinedType]> {
    return new UnionType([this, new UndefinedType()]);
  }
  nullable(): UnionType<[Type<T>, NullType]> {
    return new UnionType([this, new NullType()]);
  }
}

export class ValidationError extends Error {
  name = 'MyZodError';
}

export type Infer<T extends Type<any>> = T extends Type<infer K> ? K : any;
type TupleType = [Type<any>, Type<any>, ...Type<any>[]];

// Primitives
class StringType extends Type<string> {
  parse(value: unknown): string {
    if (typeof value !== 'string') {
      throw new ValidationError('expected type to be string but got ' + typeof value);
    }
    return value;
  }
}

class BooleanType extends Type<boolean> {
  parse(value: unknown): boolean {
    if (typeof value !== 'boolean') {
      throw new ValidationError('expected type to be boolean but got ' + typeof value);
    }
    return value;
  }
}

class NumberType extends Type<number> {
  parse(value: unknown): number {
    if (typeof value !== 'number') {
      throw new ValidationError('expected type to be number but got ' + typeof value);
    }
    return value;
  }
}

class UndefinedType extends Type<undefined> {
  parse(value: unknown): undefined {
    if (value !== undefined) {
      throw new ValidationError('expected type to be undefined but got ' + typeof value);
    }
    return value;
  }
}

class NullType extends Type<null> {
  parse(value: unknown): null {
    if (value !== null) {
      throw new ValidationError('expected type to be null but got ' + typeof value);
    }
    return value;
  }
}

type Literal = string | number | boolean | undefined | null;

class LiteralType<T extends Literal> extends Type<T> {
  constructor(private readonly literal: Literal) {
    super();
  }
  parse(value: unknown): T {
    if (value !== this.literal) {
      throw new ValidationError(
        `expected value to be literal ${JSON.stringify(this.literal)} but got ${JSON.stringify(value)}`
      );
    }
    return value as T;
  }
}

class UnknownType extends Type<unknown> {
  parse(value: unknown): unknown {
    return value;
  }
}

// Non Primitive types

type InferObjectShape<T> = {
  [key in keyof T]: T[key] extends Type<infer K> ? K : any;
};

type ObjectOptions = {
  allowUnknown?: boolean;
};

class ObjectType<T extends object> extends Type<InferObjectShape<T>> {
  constructor(private readonly objectShape: T, private readonly opts?: ObjectOptions) {
    super();
  }
  parse(value: unknown, optOverrides?: ObjectOptions): InferObjectShape<T> {
    if (typeof value !== 'object') {
      throw new ValidationError('expected type to be object: ' + typeof value);
    }
    if (value === null) {
      throw new ValidationError('expected object but got null');
    }
    if (Array.isArray(value)) {
      throw new ValidationError('expected type to be regular object but got array');
    }

    const keys = Object.keys(this.objectShape);
    const opts = { ...this.opts, ...optOverrides };
    if (!opts.allowUnknown) {
      const illegalKeys = Object.keys(value).filter(x => !keys.includes(x));
      if (illegalKeys.length > 0) {
        throw new ValidationError('unexpected keys on object: ' + illegalKeys.join(', '));
      }
    }
    const acc: any = {};
    for (const key of keys) {
      acc[key] = (this.objectShape as any)[key].parse((value as any)[key]);
    }
    return acc;
  }
}

class ArrayType<T extends Type<any>> extends Type<Infer<T>[]> {
  constructor(private readonly schema: T) {
    super();
  }
  parse(value: unknown): Infer<T>[] {
    if (!Array.isArray(value)) {
      throw new ValidationError('expected an array but got type: ' + typeof value);
    }
    value.forEach((elem, idx) => {
      try {
        this.schema.parse(elem);
      } catch (err) {
        throw new ValidationError(`error at array index ${idx}: ${err.message}`);
      }
    });
    return value;
  }
}

type TupleToUnion<T extends any[]> = T[number];
type InferTupleUnion<T extends Type<any>[]> = TupleToUnion<{ [P in keyof T]: T[P] extends Type<infer K> ? K : any }>;

class UnionType<T extends TupleType> extends Type<InferTupleUnion<T>> {
  constructor(private readonly schemas: T) {
    super();
  }

  parse(value: unknown): InferTupleUnion<T> {
    const errors: string[] = [];
    for (const schema of this.schemas) {
      try {
        schema.parse(value);
        return value as any;
      } catch (err) {
        errors.push(err.message);
      }
    }
    throw new ValidationError('No union satisfied:\n  ' + errors.join('\n  '));
  }
}

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;
type InferTupleInterSection<T extends any[]> = UnionToIntersection<InferTupleUnion<T>>;

class IntersectionType<T extends TupleType> extends Type<InferTupleInterSection<T>> {
  constructor(private readonly schemas: T) {
    super();
  }

  parse(value: unknown): InferTupleInterSection<T> {
    for (const schema of this.schemas) {
      // Todo What about unknowns keys of object intersections?
      if (schema instanceof ObjectType) {
        schema.parse(value, { allowUnknown: true });
      } else {
        schema.parse(value);
      }
    }
    return value as any;
  }
}

export const string = () => new StringType();
export const boolean = () => new BooleanType();
export const number = () => new NumberType();
export const unknown = () => new UnknownType();
export const literal = (literal: Literal) => new LiteralType(literal);
export const object = <T extends object>(shape: T, opts?: ObjectOptions) => new ObjectType(shape, opts);
export const array = <T extends Type<any>>(type: T) => new ArrayType(type);
export const union = <T extends TupleType>(schemas: T) => new UnionType(schemas);
export const intersection = <T extends TupleType>(schemas: T) => new IntersectionType(schemas);

const undefinedValue = () => new UndefinedType();
const nullValue = () => new NullType();
export { undefinedValue as undefined, nullValue as null };