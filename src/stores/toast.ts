import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface Toast {
  id: number
  message: string
  undo?: () => void
}

const DURATION_MS = 5000

export const useToastStore = defineStore('toast', () => {
  const current = ref<Toast | null>(null)
  let nextId = 1
  let timer: ReturnType<typeof setTimeout> | undefined

  function dismiss() {
    clearTimeout(timer)
    current.value = null
  }

  function show(message: string, undo?: () => void) {
    clearTimeout(timer)
    current.value = { id: nextId++, message, undo }
    timer = setTimeout(dismiss, DURATION_MS)
  }

  function runUndo() {
    const undo = current.value?.undo
    dismiss()
    undo?.()
  }

  return { current, show, dismiss, runUndo }
})
