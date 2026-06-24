import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { getPool } from './db'

let schemaReady: Promise<void> | null = null

export function ensureSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const schemaPath = path.join(process.cwd(), 'db', 'schema.sql')
    const sql = await readFile(schemaPath, 'utf8')
    await getPool().query(sql)
  })().catch(error => {
    schemaReady = null
    throw error
  })
  return schemaReady
}
