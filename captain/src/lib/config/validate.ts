import type { FieldSchema } from './schema';

export class ConfigParsingError extends Error {}

function fail(path: string, expected: string, actual: unknown): never {
  throw new ConfigParsingError(`${path}: expected ${expected}, got ${JSON.stringify(actual)}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateField(field: FieldSchema, value: unknown, path: string): void {
  switch (field.kind) {
    case 'text':
    case 'secret':
      if (typeof value !== 'string') fail(path, 'string', value);
      break;
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) fail(path, 'number', value);
      if (field.min !== undefined && value < field.min)
        fail(path, `number >= ${field.min}`, value);
      if (field.max !== undefined && value > field.max)
        fail(path, `number <= ${field.max}`, value);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') fail(path, 'boolean', value);
      break;
    case 'list-of-text':
      if (value === null) break;
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
        fail(path, 'string[]', value);
      break;
    case 'list-of-objects':
      if (value === null) break;
      if (!Array.isArray(value)) fail(path, 'object[]', value);
      for (const [index, item] of value.entries()) {
        if (!isRecord(item)) fail(`${path}[${index}]`, 'object', item);
        for (const sub of field.listObjectFields ?? []) {
          if (item[sub.key] !== undefined)
            validateField(sub, item[sub.key], `${path}[${index}].${sub.key}`);
        }
      }
      break;
    case 'object':
    case 'optional-object':
      if (!isRecord(value)) fail(path, 'object', value);
      for (const sub of field.objectFields ?? []) {
        if (value[sub.key] !== undefined) validateField(sub, value[sub.key], `${path}.${sub.key}`);
      }
      break;
  }
}

export function validateConfig(schema: readonly FieldSchema[], raw: unknown): void {
  if (!isRecord(raw)) fail('config', 'object', raw);
  for (const field of schema) {
    const value = raw[field.key];
    if (value === undefined) continue;
    if (field.kind === 'optional-object' && value === null) continue;
    validateField(field, value, field.key);
  }
}
