<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { OverlayPositionsConfig } from '$lib/config';
  import { configSchema, type WidgetGroupDef } from '$lib/config/schema';

  export let positions: OverlayPositionsConfig;
  export let onLive: ((positions: OverlayPositionsConfig) => void) | undefined = undefined;

  const STAGE_W = 1920;
  const STAGE_H = 1080;
  const MIN_SIZE = 20;

  const PALETTE = ['#4f46e5', '#0ea5e9', '#eab308', '#22c55e', '#a855f7', '#f97316'];

  interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  interface WidgetDef {
    id: string;
    label: string;
    color: string;
    read: (p: OverlayPositionsConfig) => Rect;
    write: (p: OverlayPositionsConfig, r: Rect) => void;
    describe: (p: OverlayPositionsConfig) => string;
  }

  function fieldKey(g: WidgetGroupDef, suffix: string): keyof OverlayPositionsConfig {
    return (g.prefix + suffix) as keyof OverlayPositionsConfig;
  }

  function buildWidget(g: WidgetGroupDef, idx: number): WidgetDef {
    const kx = fieldKey(g, 'X');
    const ky = fieldKey(g, 'Y');
    const kw = fieldKey(g, 'Width');
    const kh = fieldKey(g, 'Height');
    const centered = g.origin === 'center';
    return {
      id: g.id,
      label: g.label,
      color: PALETTE[idx % PALETTE.length],
      read: (p) => {
        const w = p[kw];
        const h = p[kh];
        const x = p[kx];
        const y = p[ky];
        return centered ? { x: x - w / 2, y: y - h / 2, w, h } : { x, y, w, h };
      },
      write: (p, r) => {
        p[kx] = Math.round(centered ? r.x + r.w / 2 : r.x);
        p[ky] = Math.round(centered ? r.y + r.h / 2 : r.y);
        p[kw] = Math.round(r.w);
        p[kh] = Math.round(r.h);
      },
      describe: (p) =>
        centered
          ? `center ${p[kx]},${p[ky]} ${p[kw]}x${p[kh]}`
          : `${p[kx]},${p[ky]} ${p[kw]}x${p[kh]}`
    };
  }

  const positionField = configSchema.find((f) => f.key === 'overlayPositionsConfig')!;
  const widgets = (positionField.widgetGroups ?? []).map(buildWidget);

  for (const g of positionField.widgetGroups ?? []) {
    for (const suffix of ['X', 'Y', 'Width', 'Height']) {
      const key = g.prefix + suffix;
      if (!positionField.objectFields?.some((f) => f.key === key)) {
        throw new Error(`Position editor: widget '${g.id}' references missing field '${key}'`);
      }
    }
  }

  let stageEl: HTMLDivElement | undefined;
  let wrapEl: HTMLDivElement | undefined;
  let scale = 1;
  let drag: {
    def: WidgetDef;
    start: Rect;
    origin: { x: number; y: number };
    mode: 'move' | 'resize';
  } | null = null;
  let rafPending = false;

  function toStage(clientX: number, clientY: number): { x: number; y: number } {
    const rect = stageEl!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * STAGE_W,
      y: ((clientY - rect.top) / rect.height) * STAGE_H
    };
  }

  function updateScale() {
    if (!wrapEl) return;
    scale = wrapEl.clientWidth / STAGE_W;
  }

  onMount(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
  });

  onDestroy(() => {
    window.removeEventListener('resize', updateScale);
    endDrag();
  });

  function clampResize(w: number, h: number): { w: number; h: number } {
    return { w: Math.max(w, MIN_SIZE), h: Math.max(h, MIN_SIZE) };
  }

  function commit(r: Rect) {
    if (!drag) return;
    drag.def.write(positions, r);
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        onLive?.(positions);
      });
    }
  }

  function endDrag() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  function onPointerDown(def: WidgetDef, e: PointerEvent, mode: 'move' | 'resize') {
    e.preventDefault();
    drag = { def, start: def.read(positions), origin: toStage(e.clientX, e.clientY), mode };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    e.preventDefault();
    const pt = toStage(e.clientX, e.clientY);
    const dx = pt.x - drag.origin.x;
    const dy = pt.y - drag.origin.y;
    if (drag.mode === 'move') {
      commit({ ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy });
    } else {
      commit({ ...drag.start, ...clampResize(drag.start.w + dx, drag.start.h + dy) });
    }
  }

  function onPointerUp() {
    if (!drag) return;
    drag = null;
    endDrag();
    onLive?.(positions);
  }

  let resetStatus = '';
  let resetBusy = false;

  async function resetToSaved() {
    resetBusy = true;
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error(`status ${res.status}`);
      const cfg = await res.json();
      const saved = (cfg.overlayPositionsConfig ?? {}) as Partial<OverlayPositionsConfig>;
      for (const key of Object.keys(positions) as (keyof OverlayPositionsConfig)[]) {
        const v = saved[key];
        if (v !== undefined) {
          positions[key] = v;
        }
      }
      positions = positions;
      onLive?.(positions);
      resetStatus = 'Reset to last saved positions';
    } catch (e) {
      resetStatus = `Reset failed: ${e}`;
    }
    resetBusy = false;
    setTimeout(() => (resetStatus = ''), 3000);
  }
</script>

<p class="position-editor-hint">
  Drag boxes to move, drag the corner handle to resize. Changes apply to the live overlay
  immediately; press Save Config to persist.
</p>

<div class="reset-row">
  <button type="button" class="reset-btn" on:click={resetToSaved} disabled={resetBusy}
    >Reset to last saved positions</button
  >
  {#if resetStatus}
    <span class="reset-status">{resetStatus}</span>
  {/if}
</div>

<div class="stage-wrap" bind:this={wrapEl} style="height: {STAGE_H * scale}px;">
  <div
    class="stage"
    bind:this={stageEl}
    style="width: {STAGE_W}px; height: {STAGE_H}px; transform: scale({scale});"
  >
    {#each widgets as def}
      {@const r = def.read(positions)}
      <div
        class="widget-box"
        class:dragging={drag?.def.id === def.id}
        style="left: {r.x}px; top: {r.y}px; width: {r.w}px; height: {r.h}px; border-color: {def.color};"
        on:pointerdown={(e) => onPointerDown(def, e, 'move')}
      >
        <span class="widget-label" style="background-color: {def.color};">{def.label}</span>
        <span
          class="resize-handle"
          style="border-color: {def.color};"
          on:pointerdown|stopPropagation={(e) => onPointerDown(def, e, 'resize')}
        ></span>
      </div>
    {/each}
  </div>
</div>

<div class="position-readout">
  {#each widgets as def}
    <span class="readout-item">
      <b style="color: {def.color};">{def.label}</b>
      <code>{def.describe(positions)}</code>
    </span>
  {/each}
</div>

<style>
  .position-editor-hint {
    font-size: 0.85em;
    color: #666;
    margin: 0 0 0.4em 0;
  }

  .reset-row {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.4em;
  }

  .reset-btn {
    background: #448;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    padding: 4px 10px;
    font-size: 0.85em;
  }

  .reset-btn:hover {
    background: #55a;
  }

  .reset-status {
    font-size: 0.85em;
    color: #666;
  }

  .stage-wrap {
    position: relative;
    width: 100%;
    overflow: hidden;
    border: 1px solid #888;
    border-radius: 4px;
    background:
      linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px), #222;
    background-size: 96px 54px;
    user-select: none;
  }

  .stage {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: top left;
  }

  .widget-box {
    position: absolute;
    border: 2px dashed;
    border-radius: 4px;
    box-sizing: border-box;
    cursor: grab;
    touch-action: none;
  }

  .widget-box.dragging,
  .widget-box.dragging * {
    cursor: grabbing;
  }

  .widget-box:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  .widget-label {
    position: absolute;
    top: -1.6em;
    left: -2px;
    font-size: 12px;
    line-height: 1.2;
    color: white;
    padding: 1px 6px;
    border-radius: 3px;
    white-space: nowrap;
  }

  .resize-handle {
    position: absolute;
    right: -8px;
    bottom: -8px;
    width: 16px;
    height: 16px;
    border: 3px solid;
    border-radius: 4px;
    background: white;
    cursor: nwse-resize;
    box-sizing: border-box;
    touch-action: none;
  }

  .position-readout {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3em 1.5em;
    margin-top: 0.5em;
    font-size: 0.85em;
  }

  .readout-item {
    display: flex;
    align-items: baseline;
    gap: 0.4em;
  }

  .readout-item code {
    font-family: monospace;
    color: #444;
  }
</style>
