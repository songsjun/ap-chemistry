'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { StorageService, type ThemePreference } from '@/lib/infra/storage'
import { applyStoredTheme } from '@/components/AppInitializer'
import { exportProgress, importProgress, downloadJson, type ExportData } from '@/lib/app/share'

export function SettingsClient() {
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [importError, setImportError] = useState('')
  const [theme, setTheme] = useState<ThemePreference>('system')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTheme(StorageService.theme.get())
  }, [])

  function handleThemeChange(t: ThemePreference) {
    setTheme(t)
    StorageService.theme.save(t)
    applyStoredTheme()
  }

  async function handleExport() {
    const userId = StorageService.userId.get()
    if (!userId) return
    const data = await exportProgress(userId)
    downloadJson(data, `ap-chem-progress-${new Date().toISOString().slice(0, 10)}.json`)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('idle')
    try {
      const text = await file.text()
      const raw: unknown = JSON.parse(text)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('文件格式错误：不是有效的 JSON 对象')
      }
      const userId = StorageService.userId.get()
      if (!userId) throw new Error('用户未初始化')
      await importProgress(userId, raw as ExportData)
      setImportStatus('success')
    } catch (err) {
      setImportStatus('error')
      setImportError(err instanceof Error ? err.message : '文件格式错误')
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const themeOptions: { value: ThemePreference; label: string; icon: string }[] = [
    { value: 'light', label: '浅色', icon: '☀️' },
    { value: 'system', label: '跟随系统', icon: '⚙️' },
    { value: 'dark', label: '深色', icon: '🌙' },
  ]

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-sm text-blue-500 hover:underline">← 返回首页</Link>
        <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100">设置</h1>
      </div>

      {/* Theme preference */}
      <section className="bg-white dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">外观主题</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
            选择界面显示主题。设置仅保存在本地浏览器。
          </p>
        </div>
        <div className="flex gap-2">
          {themeOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleThemeChange(opt.value)}
              className={`flex-1 py-2.5 text-sm rounded-lg border transition-colors ${
                theme === opt.value
                  ? 'bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-800 dark:border-stone-100 font-medium'
                  : 'bg-stone-50 dark:bg-stone-700 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-600 hover:bg-stone-100 dark:hover:bg-stone-600'
              }`}
            >
              <span className="mr-1.5">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* AI gateway */}
      <section className="bg-white dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">AI Gateway</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">
            AI 批改和学习反馈由本机 AOPS AI Gateway 提供。浏览器不会保存或上传模型密钥。
          </p>
        </div>
        <p className="text-xs text-stone-400 dark:text-stone-500">
          本地部署需要同时运行 <code className="font-mono">aops_calculus</code> 的 AI gateway 和 AP AI proxy。
        </p>
      </section>

      {/* Progress backup */}
      <section className="bg-white dark:bg-stone-800 rounded-xl border border-stone-100 dark:border-stone-700 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-stone-900 dark:text-stone-100">学习进度备份</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-0.5">导出进度到 JSON 文件，或从备份文件恢复（会覆盖当前进度）。</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-lg transition-colors dark:bg-stone-700 dark:hover:bg-stone-600 dark:text-stone-300"
          >
            导出进度
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-lg transition-colors dark:bg-stone-700 dark:hover:bg-stone-600 dark:text-stone-300"
          >
            导入进度
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
        </div>
        {importStatus === 'success' && (
          <p className="text-sm text-emerald-600">✓ 进度已成功导入，请刷新页面查看更新。</p>
        )}
        {importStatus === 'error' && (
          <p className="text-sm text-red-500">导入失败：{importError}</p>
        )}
      </section>
    </div>
  )
}
