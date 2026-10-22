// Local Supabase signs tokens with an ES256 key, as the hosted project does: the mcp Edge Function
// (docs/ia.md) only accepts those. config.toml points at supabase/signing_keys.json, which stays
// out of git (it is a private key); `npm run db:start` runs this first and makes one if missing.
// Made here and not with `supabase gen signing-key`, which fails while the file is missing.

import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('./signing_keys.json', import.meta.url))
if (!existsSync(file)) {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  // The same shape as `supabase gen signing-key --algorithm ES256`, in the list Auth reads.
  const key = { ...privateKey.export({ format: 'jwk' }), kid: randomUUID(), use: 'sig', key_ops: ['sign', 'verify'], alg: 'ES256', ext: true }
  writeFileSync(file, `${JSON.stringify([key], null, 2)}\n`)
  console.log('Created supabase/signing_keys.json (local ES256 signing key)')
}
