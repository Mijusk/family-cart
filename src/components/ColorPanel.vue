<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { hexToHsv, hsvToHex, parseHex, type Hsv } from '@/utils/colors'

// A saturation/brightness square and a hue bar, like the usual system color picker.
const color = defineModel<string>({ required: true })

// The picker keeps its own hue, so it doesn't jump when the color goes grey or black.
const hsv = reactive<Hsv>(hexToHsv(color.value))
const hexText = ref(color.value)
watch(color, (c) => {
  if (c !== hsvToHex(hsv)) Object.assign(hsv, hexToHsv(c))
  if (parseHex(hexText.value) !== c) hexText.value = c
})

function set(patch: Partial<Hsv>) {
  Object.assign(hsv, patch)
  color.value = hsvToHex(hsv)
}

const clamp = (n: number) => Math.min(1, Math.max(0, n))

/** Follows a finger or the mouse from pointerdown until it lets go. */
function drag(onMove: (x: number, y: number) => void) {
  return (down: PointerEvent) => {
    const el = down.currentTarget as HTMLElement
    el.setPointerCapture(down.pointerId)
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      onMove(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height))
    }
    move(down)
    el.onpointermove = move
    el.onpointerup = el.onpointercancel = () => (el.onpointermove = el.onpointerup = el.onpointercancel = null)
  }
}

const dragArea = drag((x, y) => set({ s: x, v: 1 - y }))
const dragHue = drag((x) => set({ h: x * 360 }))

const STEP = 0.02
function areaKey(e: KeyboardEvent) {
  const moves: Record<string, Partial<Hsv>> = {
    ArrowLeft: { s: clamp(hsv.s - STEP) },
    ArrowRight: { s: clamp(hsv.s + STEP) },
    ArrowUp: { v: clamp(hsv.v + STEP) },
    ArrowDown: { v: clamp(hsv.v - STEP) },
  }
  if (!moves[e.key]) return
  e.preventDefault()
  set(moves[e.key]!)
}
function hueKey(e: KeyboardEvent) {
  const delta = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -3 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 3 : 0
  if (!delta) return
  e.preventDefault()
  set({ h: (hsv.h + delta + 360) % 360 })
}

function typed() {
  const hex = parseHex(hexText.value)
  if (hex) color.value = hex
}

const pureHue = computed(() => `hsl(${hsv.h} 100% 50%)`)
</script>

<template>
  <div class="panel">
    <div class="top">
      <div class="preview" :style="{ background: color }" />
      <div
        class="area"
        role="slider"
        tabindex="0"
        aria-label="Intensidad y brillo"
        :aria-valuetext="`Intensidad ${Math.round(hsv.s * 100)} %, brillo ${Math.round(hsv.v * 100)} %`"
        :style="{ background: pureHue }"
        @pointerdown="dragArea"
        @keydown="areaKey"
      >
        <span class="thumb" :style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: color }" />
      </div>
    </div>
    <div
      class="hue"
      role="slider"
      tabindex="0"
      aria-label="Tono"
      aria-valuemin="0"
      aria-valuemax="360"
      :aria-valuenow="Math.round(hsv.h)"
      @pointerdown="dragHue"
      @keydown="hueKey"
    >
      <span class="thumb" :style="{ left: `${(hsv.h / 360) * 100}%`, background: pureHue }" />
    </div>
    <label class="hex">
      <span class="muted">Código</span>
      <input v-model="hexText" class="field" maxlength="7" spellcheck="false" autocapitalize="off" @input="typed" @blur="hexText = color" />
    </label>
  </div>
</template>

<style scoped>
.panel {
  display: grid;
  gap: 14px;
  padding: 12px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--surface);
}

.top {
  display: flex;
  height: 150px;
  border-radius: calc(var(--radius) - 4px);
  overflow: hidden;
}

.preview {
  flex: 0 0 30%;
}

.area {
  position: relative;
  flex: 1;
  cursor: crosshair;
  touch-action: none;
  background-image:
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, transparent);
}

.hue {
  position: relative;
  height: 12px;
  margin: 6px 11px;
  border-radius: 999px;
  cursor: pointer;
  touch-action: none;
  background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
}

/* A bigger invisible target for fingers. */
.hue::before {
  content: '';
  position: absolute;
  inset: -12px -11px;
}

.thumb {
  position: absolute;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2.5px solid #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 35%), 0 1px 3px rgb(0 0 0 / 30%);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.hue .thumb {
  top: 50%;
}

.area:focus-visible,
.hue:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent);
  outline-offset: 2px;
}

.hex {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9375rem;
}

.hex .field {
  max-width: 120px;
  font-family: ui-monospace, monospace;
}
</style>
