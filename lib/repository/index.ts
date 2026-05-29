import type { IRepository } from './interface'
import { DexieRepository } from './dexie.repo'

export const repo: IRepository = new DexieRepository()
export type { IRepository }
