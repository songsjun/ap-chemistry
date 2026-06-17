import nextEnv from '@next/env'

const { loadEnvConfig } = nextEnv

let loaded = false

export function loadServerEnv(projectDir = process.cwd()): void {
  if (loaded) return
  loadEnvConfig(projectDir)
  loaded = true
}

loadServerEnv()
