// Small helpers to register tools with the same error handling and answer shape.

import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { DATA_NOTICE } from './agenda.ts'
import { toolErrorText } from './context.ts'

type ToolResult = CallToolResult

/** A read: data as JSON, with the reminder that what people wrote is data, not instructions. */
export const data = (value: Record<string, unknown>): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify({ aviso: DATA_NOTICE, ...value }, null, 1) }],
})

/** A write: what was done, in a sentence or two. */
export const done = (text: string): ToolResult => ({ content: [{ type: 'text', text }] })

/** Read-only tools never change anything; the rest change data but never delete it. */
const READ = { readOnlyHint: true, openWorldHint: false } as const
const CREATE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const
const CHANGE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const

export type ToolKind = 'read' | 'create' | 'change'

export function tool<Shape extends z.ZodObject>(
  server: McpServer,
  name: string,
  kind: ToolKind,
  config: { title: string; description: string; input: Shape },
  run: (input: z.infer<Shape>) => Promise<ToolResult>,
) {
  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.input,
      annotations: { title: config.title, ...(kind === 'read' ? READ : kind === 'create' ? CREATE : CHANGE) },
    },
    // The SDK can't infer the input of a generic schema; run() is typed by each tool's own schema.
    (async (input: z.infer<Shape>): Promise<ToolResult> => {
      try {
        return await run(input)
      } catch (e) {
        return { content: [{ type: 'text', text: toolErrorText(name, e) }], isError: true }
      }
    }) as never,
  )
}

/** Said in the description of every tool that writes. */
export const CONFIRM_FIRST =
  'Antes de llamarla, resume a la persona lo que vas a hacer (con el día de la semana y la fecha) y espera a que diga que sí.'
