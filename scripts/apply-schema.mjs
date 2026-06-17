#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import nextEnv from '@next/env'
import pg from 'pg'

const { loadEnvConfig } = nextEnv
const { Pool } = pg

const DEFAULT_DATABASE_URL = 'postgres://localhost:5432/ap_chemistry'

loadEnvConfig(process.cwd())

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? DEFAULT_DATABASE_URL,
})

try {
  const schema = await readFile(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  await pool.query(schema)
  console.log('schema_applied=true')
} finally {
  await pool.end()
}
