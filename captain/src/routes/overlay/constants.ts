import { mergeConfig } from '$lib/config/defaults';
import { configSchema, type FieldSchema } from '$lib/config/schema';
import { parseConfig } from '$lib/config';
import type { FullConfig } from '$lib/config';

const commandSectionKeys = new Set(
  (configSchema as readonly FieldSchema[])
    .filter((field) => field.commandSection)
    .map((field) => field.key)
);

let _overlayConfig: FullConfig = mergeConfig(configSchema, {});
let disabledSections = new Set<string>();
let delegateVoiceToOverlay = false;

export function isSectionDisabled(sectionKey: string): boolean {
  return disabledSections.has(sectionKey);
}

export function isDelegateVoiceToOverlay(): boolean {
  return delegateVoiceToOverlay;
}

export type OverlayConfig = FullConfig;

export function getOverlayConfig(): FullConfig {
  return _overlayConfig;
}

export function applyOverlayConfig(raw?: Record<string, unknown>): void {
  if (!raw) return;

  const parsed = parseConfig(raw);
  const nextDisabledSections = computeDisabledSections(raw);

  delegateVoiceToOverlay = !!raw.delegateVoiceToOverlay;
  _overlayConfig = parsed;
  disabledSections = nextDisabledSections;
}

function computeDisabledSections(raw: Record<string, unknown>): Set<string> {
  const disabled = new Set<string>();
  for (const key of commandSectionKeys) {
    if (raw[key] === undefined) disabled.add(key);
  }
  return disabled;
}
