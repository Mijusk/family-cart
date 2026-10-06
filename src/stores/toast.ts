import { ref } from 'vue'
import { defineStore } from 'pinia'

export interface Toast {
  id: number
  message: string
  undo?: () => void
  /** Runs when the toast goes away without being undone (timeout, OK, or replaced by another). */
  done?: () => void
}

const DURATION_MS = 5000

export const useToastStore = defineStore('toast', () => {
  const current = ref<Toast | null>(null)
  let nextId = 1
  let timer: ReturnType<typeof setTimeout> | undefined

  function close(): Toast | null {
    clearTimeout(timer)
    const toast = current.value
    current.value = null
    return toast
  }

  function dismiss() {
    close()?.done?.()
  }

  function show(message: string, undo?: () => void, done?: () => void) {
    dismiss()
    current.value = { id: nextId++, message, undo, done }
    timer = setTimeout(dismiss, DURATION_MS)
  }

  function runUndo() {
    close()?.undo?.()
  }

  return { current, show, dismiss, runUndo }
})
