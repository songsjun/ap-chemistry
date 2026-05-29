import { DayPageClient } from './DayPageClient'
import { DayHeader } from '@/components/day/DayHeader'
import { WEEKS, DAYS_PER_WEEK } from '@/lib/constants'

interface Props {
  params: Promise<{ w: string; d: string }>
}

export default async function DayPage({ params }: Props) {
  const { w, d } = await params
  const week = parseInt(w, 10)
  const day = parseInt(d, 10)

  return (
    <main className="min-h-screen py-8">
      <DayHeader week={week} day={day} />
      <DayPageClient week={week} day={day} />
    </main>
  )
}

export function generateStaticParams() {
  const params = []
  for (let w = 1; w <= WEEKS; w++) {
    for (let d = 1; d <= DAYS_PER_WEEK; d++) {
      params.push({ w: String(w), d: String(d) })
    }
  }
  return params
}
