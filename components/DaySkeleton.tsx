/**
 * Loading skeleton for the Day page.
 *
 * Structure mirrors DayListView so the layout shift is minimal:
 *   - A-tier section (required resources)
 *   - B-tier section (supplementary resources)
 *   - C-tier section (extension resources)
 *
 * Colour uses stone-100/stone-200 to match the app's stone palette.
 */
export function DaySkeleton() {
  return (
    <div className="max-w-2xl mx-auto px-4 pb-12 space-y-4 animate-pulse">

      {/* DayHeader placeholder — mirrors: pt-2 flex items-start justify-between + mb-6 */}
      <div className="pt-2 mb-6 flex items-start justify-between">
        {/* Left: AP Physics label + Week · Day title */}
        <div className="space-y-1.5">
          <div className="h-3 w-24 bg-stone-200 dark:bg-stone-700 rounded" />
          <div className="h-7 w-40 bg-stone-200 dark:bg-stone-700 rounded" />
        </div>
        {/* Right: back link + settings icon */}
        <div className="flex items-center gap-4 mt-1">
          <div className="h-4 w-10 bg-stone-200 dark:bg-stone-700 rounded" />
          <div className="w-4 h-4 bg-stone-200 dark:bg-stone-700 rounded" />
        </div>
      </div>

      {/* A 必做 tier card */}
      <div className="rounded-xl border border-stone-100 overflow-hidden">
        {/* Section header */}
        <div className="bg-blue-50 px-4 py-3 flex items-center justify-between border-b border-blue-100">
          <div className="flex items-center gap-2">
            <div className="h-4 w-10 bg-stone-200 dark:bg-stone-700 rounded" />
            <div className="h-3 w-16 bg-stone-200 dark:bg-stone-700 rounded" />
          </div>
          <div className="h-3 w-20 bg-stone-200 dark:bg-stone-700 rounded" />
        </div>
        {/* Resource rows */}
        <div className="divide-y divide-stone-50">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-stone-100 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-stone-100 rounded w-3/4" />
                <div className="h-3 bg-stone-100 rounded w-1/3" />
              </div>
              <div className="w-7 h-7 rounded-full bg-stone-100 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* B 建议 tier card */}
      <div className="rounded-xl border border-stone-100 overflow-hidden">
        <div className="bg-amber-50 px-4 py-3 flex items-center justify-between border-b border-amber-100">
          <div className="flex items-center gap-2">
            <div className="h-4 w-16 bg-stone-200 dark:bg-stone-700 rounded" />
            <div className="h-3 w-24 bg-stone-200 dark:bg-stone-700 rounded" />
          </div>
          <div className="h-3.5 w-3.5 bg-stone-200 dark:bg-stone-700 rounded" />
        </div>
        <div className="divide-y divide-stone-50">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-stone-100 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-stone-100 rounded w-2/3" />
                <div className="h-3 bg-stone-100 rounded w-1/4" />
              </div>
              <div className="w-7 h-7 rounded-full bg-stone-100 shrink-0" />
            </div>
          ))}
        </div>
      </div>

      {/* C 拓展 tier card */}
      <div className="rounded-xl border border-stone-100 overflow-hidden">
        <div className="bg-stone-50 px-4 py-3 flex items-center justify-between border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="h-4 w-10 bg-stone-200 dark:bg-stone-700 rounded" />
            <div className="h-3 w-20 bg-stone-200 dark:bg-stone-700 rounded" />
          </div>
          <div className="h-3.5 w-3.5 bg-stone-200 dark:bg-stone-700 rounded" />
        </div>
        <div className="divide-y divide-stone-50">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-stone-100 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-stone-100 rounded w-1/2" />
                <div className="h-3 bg-stone-100 rounded w-1/4" />
              </div>
              <div className="w-7 h-7 rounded-full bg-stone-100 shrink-0" />
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
