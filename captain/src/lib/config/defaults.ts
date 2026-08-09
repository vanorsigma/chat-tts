import { configSchema, type FieldSchema } from './schema';
import type { FullConfig, OverlayPositionsConfig } from '../config';

function cloneDefault(value: unknown, fallback: unknown): unknown {
  if (value === undefined) return fallback;
  if (value !== null && typeof value === 'object') return structuredClone(value);
  return value;
}

function defaultForKind(kind: FieldSchema['kind']): unknown {
  switch (kind) {
    case 'list-of-text':
    case 'list-of-objects':
      return [];
    case 'boolean':
      return false;
    case 'number':
      return 0;
    default:
      return '';
  }
}

/**
 * Produces a fully-populated defaults object from a schema.
 * `optional-object` sections are materialized by mergeConfig instead.
 */
export function buildDefaults(schema: readonly FieldSchema[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of schema) {
    if (field.kind === 'object') {
      out[field.key] = buildDefaults(field.objectFields ?? []);
    } else if (field.kind === 'optional-object') {
      // handled by mergeConfig
    } else {
      out[field.key] = cloneDefault(field.default, defaultForKind(field.kind));
    }
  }
  return out;
}

export function mergeConfig(
  schema: readonly FieldSchema[],
  raw: Record<string, unknown>
): FullConfig {
  const result: Record<string, unknown> = {};
  for (const field of schema) {
    const provided = raw[field.key];
    if (field.kind === 'object') {
      result[field.key] = {
        ...buildDefaults(field.objectFields ?? []),
        ...((provided as Record<string, unknown> | undefined) ?? {})
      };
    } else if (field.kind === 'optional-object') {
      const innerDefaults = buildDefaults(field.objectFields ?? []);
      if (provided !== undefined && provided !== null) {
        result[field.key] = { ...innerDefaults, ...(provided as Record<string, unknown>) };
      } else if (field.alwaysPresent) {
        result[field.key] = innerDefaults;
      } else {
        result[field.key] = undefined;
      }
    } else if (field.kind === 'list-of-text' || field.kind === 'list-of-objects') {
      result[field.key] = provided ?? cloneDefault(field.default, []);
    } else {
      result[field.key] = cloneDefault(
        provided,
        cloneDefault(field.default, defaultForKind(field.kind))
      );
    }
  }
  result.dynamicConfig = { songPitchSpeedAffected: false };
  return result as unknown as FullConfig;
}

const positionsSchema = configSchema.find((f) => f.key === 'overlayPositionsConfig');

export const defaultPositions = (positionsSchema
  ? buildDefaults(positionsSchema.objectFields ?? [])
  : {
      artistWidgetX: 20,
      artistWidgetY: 20,
      artistWidgetWidth: 360,
      artistWidgetHeight: 90,
      rightPanelX: 1520,
      rightPanelY: 0,
      rightPanelWidth: 400,
      rightPanelHeight: 1080,
      pinX: 760,
      pinY: 40,
      pinWidth: 400,
      pinHeight: 120,
      wheelX: 960,
      wheelY: 540,
      wheelWidth: 648,
      wheelHeight: 648
    }) as unknown as OverlayPositionsConfig;
