import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The function imports pure modules of the app (src/) under Deno, which needs relative paths with
// the .ts extension and no Vue. This walks every import from here into src/ and checks each file
// on the way, so a change in the app that would break the deployed function fails here first.

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../../../src')

const specifiers = (file: string) =>
  [...readFileSync(file, 'utf8').matchAll(/^\s*(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!)

describe('modules shared with the app', () => {
  it('reach src/ only through relative .ts imports, without Vue', () => {
    const roots = readdirSync(here)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => join(here, f))
    const seen = new Set<string>()
    const problems: string[] = []
    const visit = (file: string) => {
      for (const spec of specifiers(file)) {
        const inSrc = file.startsWith(src)
        if (!spec.startsWith('.')) {
          // Under src/ nothing but relative imports; the function's own files use npm:/jsr: and the import map.
          if (inSrc) problems.push(`${relative(src, file)} imports ${spec}`)
          continue
        }
        if (!spec.endsWith('.ts')) problems.push(`${relative(here, file)} imports ${spec} without .ts`)
        const target = resolve(dirname(file), spec)
        if (!seen.has(target) && target.startsWith(src)) {
          seen.add(target)
          visit(target)
        }
      }
    }
    roots.forEach(visit)
    expect(seen.size).toBeGreaterThan(0)
    expect(problems).toEqual([])
  })
})
