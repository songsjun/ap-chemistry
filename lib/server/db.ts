import { Pool, type PoolClient, type QueryResultRow } from 'pg'

import './env'

const DEFAULT_DATABASE_URL = 'postgres://localhost:5432/ap_chemistry'

declare global {
  var __apChemPgPool: Pool | undefined
}

function databaseUrl(): string {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? DEFAULT_DATABASE_URL
}

export function getPool(): Pool {
  if (!globalThis.__apChemPgPool) {
    globalThis.__apChemPgPool = new Pool({
      connectionString: databaseUrl(),
    })
  }
  return globalThis.__apChemPgPool
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(text, values)
  return result.rows
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
