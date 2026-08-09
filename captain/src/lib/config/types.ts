import type { FieldSchema } from './schema';

export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;

type FieldToType<F extends FieldSchema> = F['kind'] extends 'text' | 'secret'
  ? string
  : F['kind'] extends 'number'
    ? number
    : F['kind'] extends 'boolean'
      ? boolean
      : F['kind'] extends 'list-of-text'
        ? string[]
        : F['kind'] extends 'list-of-objects'
          ? SchemaToType<NonNullable<F['listObjectFields']>>[]
          : F['kind'] extends 'object'
            ? SchemaToType<NonNullable<F['objectFields']>>
            : F['kind'] extends 'optional-object'
              ? F['alwaysPresent'] extends true
                ? SchemaToType<NonNullable<F['objectFields']>>
                : SchemaToType<NonNullable<F['objectFields']>> | undefined
              : never;

export type SchemaToType<S extends readonly FieldSchema[]> = {
  [K in S[number]['key']]: FieldToType<Extract<S[number], { key: K }>>;
};
