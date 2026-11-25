// A stand-in for the Supabase client in the stores' tests: every query, whatever its filters,
// answers what `answers` says for its table or RPC ([] by default), and is written down in `calls`.

export interface FakeAnswer {
  data?: unknown
  error?: { message: string; code?: string } | null
  status?: number
}

export interface FakeCall {
  /** The table, or the RPC's name. */
  target: string
  /** The methods called on the query, with their arguments. */
  steps: [method: string, args: unknown[]][]
}

type Answerer = FakeAnswer | ((call: FakeCall) => FakeAnswer | Promise<FakeAnswer>)

export function fakeSupabase() {
  const answers: Record<string, Answerer> = {}
  const calls: FakeCall[] = []

  function query(target: string, first?: [string, unknown[]]) {
    const call: FakeCall = { target, steps: first ? [first] : [] }
    const builder: unknown = new Proxy(
      {},
      {
        get(_, method: string) {
          if (method !== 'then') {
            return (...args: unknown[]) => {
              call.steps.push([method, args])
              return builder
            }
          }
          // Awaited: only now is it sent, as with the real builder.
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            calls.push(call)
            const answer = answers[target]
            return Promise.resolve(typeof answer === 'function' ? answer(call) : answer)
              .then((r) => ({ data: r?.error ? null : (r?.data ?? []), error: r?.error ?? null, status: r?.status ?? 200 }))
              .then(resolve, reject)
          }
        },
      },
    )
    return builder
  }

  /** The channels opened, by name. */
  const channels: string[] = []
  const listeners: { table: string; run: (payload: unknown) => void }[] = []
  const channel = {
    on(_type: string, filter: { table?: string }, run: (payload: unknown) => void) {
      if (filter.table) listeners.push({ table: filter.table, run })
      return channel
    },
    subscribe: () => channel,
  }
  /** A change arriving through Realtime. */
  function emit(table: string, payload: unknown) {
    for (const l of listeners) if (l.table === table) l.run(payload)
  }
  const client = {
    from: (table: string) => query(table),
    rpc: (name: string, args?: unknown) => query(name, ['rpc', [args]]),
    channel: (name: string) => {
      channels.push(name)
      return channel
    },
    removeChannel: () => {},
    storage: { from: () => ({ upload: (...args: unknown[]) => query('storage.upload', ['upload', args]) }) },
  }
  return { client, answers, calls, channels, emit }
}

/** Queries of a table (or RPC) that used this method. */
export function callsTo(calls: FakeCall[], target: string, method?: string): FakeCall[] {
  return calls.filter((c) => c.target === target && (!method || c.steps.some(([m]) => m === method)))
}
