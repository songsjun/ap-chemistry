import { getDb } from '@/lib/infra/db'
import { LIBRARY_VERSION } from '@/lib/constants'
import type { Resource, KnowledgePoint } from '@/lib/types'

type RawResource = Omit<Resource, 'adapter_type' | 'phase' | 'slot_order'> & {
  url?: string | null
  answer_url?: string
}

function deriveAdapterType(r: RawResource): Resource['adapter_type'] {
  if (r.type === 'interactive') return 'observation'
  return 'external_manual'
}

function derivePhase(type: string): Resource['phase'] {
  if (type === 'exercise') return 'PRACTICE'
  return 'LEARN'
}

const PHASE_ORDER: Record<Resource['phase'], number> = { LEARN: 0, PRACTICE: 1 }

function assignSlotOrders(resources: RawResource[]): Map<string, number> {
  const groups = new Map<string, RawResource[]>()
  for (const r of resources) {
    const key = `${r.week}-${r.day}-${r.tier}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }
  const result = new Map<string, number>()
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const pA = PHASE_ORDER[derivePhase(a.type)]
      const pB = PHASE_ORDER[derivePhase(b.type)]
      if (pA !== pB) return pA - pB
      // Within same phase: interactive first (build intuition), frq last (synthesis)
      const typeRank = (r: RawResource) => r.type === 'interactive' ? 0 : r.type === 'frq' ? 2 : 1
      const tA = typeRank(a), tB = typeRank(b)
      if (tA !== tB) return tA - tB
      return a.id.localeCompare(b.id)
    })
    group.forEach((r, i) => result.set(r.id, i + 1))
  }
  return result
}

export async function seedContentLibrary(): Promise<void> {
  const db = getDb()
  const meta = await db.meta.get('content_version')
  if (meta?.value === LIBRARY_VERSION) return

  const { concepts, resources } = (await import('@/data/content_library.json')) as {
    metadata: unknown
    concepts: KnowledgePoint[]
    resources: RawResource[]
  }

  const slotOrders = assignSlotOrders(resources)

  const processed: Resource[] = resources.map(r => {
    const adapter_type = deriveAdapterType(r)
    return {
      ...r,
      adapter_type,
      phase: derivePhase(r.type),
      slot_order: slotOrders.get(r.id) ?? 0,
      url: r.url ?? null,
      answer_url: r.answer_url,
    }
  })

  await db.transaction('rw', db.knowledge_points, db.resources, db.meta, async () => {
    await db.knowledge_points.clear()
    await db.resources.clear()
    await db.knowledge_points.bulkPut(concepts as KnowledgePoint[])
    await db.resources.bulkPut(processed)
    await db.meta.put({ key: 'content_version', value: LIBRARY_VERSION })
  })
}
