const APP_VERSION = '2026.06.18.3'

export function VersionBadge() {
  return (
    <div className="fixed bottom-2 right-2 z-50 pointer-events-none rounded-md border border-stone-200 bg-white/90 px-2 py-1 text-[10px] font-medium text-stone-500 shadow-sm backdrop-blur dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-400">
      AP Chemistry build {APP_VERSION}
    </div>
  )
}
