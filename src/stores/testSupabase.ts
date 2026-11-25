// A stand-in for the Supabase client in the stores' tests: every query, whatever its filters,
// answers what `answers` says for its table or RPC ([] by default), and is written down in `calls`.

export interface FakeAnswer {
  data?: unknown
  error?: { message: string; code?: string } | null
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
              .then((r) => ({ data: r?.error ? null : (r?.data ?? []), error: r?.error ?? null }))
              .then(resolve, reject)
          }
        },
      },
    )
    return builder
  }

  const channel = { on: () => channel, subscribe: () => channel }
  const client = {
    from: (table: string) => query(table),
    rpc: (name: string, args?: unknown) => query(name, ['rpc', [args]]),
    channel: () => channel,
    removeChannel: () => {},
  }
  return { client, answers, calls }
}

/** Queries of a table (or RPC) that used this method. */
export function callsTo(calls: FakeCall[], target: string, method?: string): FakeCall[] {
  return calls.filter((c) => c.target === target && (!method || c.steps.some(([m]) => m === method)))
}
