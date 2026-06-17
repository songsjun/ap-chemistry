import type { IRepository } from './interface'
import { RemoteProgressRepository } from './remote.repo'

export const repo: IRepository = new RemoteProgressRepository()
export type { IRepository }
