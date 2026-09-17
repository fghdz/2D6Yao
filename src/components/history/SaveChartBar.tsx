import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useHistory } from '@/hooks/useHistory'
import { evidenceSnapshot, useChartEvidence } from '@/hooks/useChartEvidence'
import { useChartStore } from '@/store/chartStore'

export function SaveChartBar() {
  const { save, update, saving } = useHistory()
  const { chart, question, chapter, exchanges, savedId, setQuestion, setSavedId } = useChartStore()
  // 存下当时的标签、用神与并入的条文，复盘才能对照**当时**的判断依据。
  const snapshot = evidenceSnapshot(useChartEvidence())
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (!justSaved) return
    const timer = setTimeout(() => setJustSaved(false), 1500)
    return () => clearTimeout(timer)
  }, [justSaved])

  if (!chart) return null

  const handleSave = async () => {
    if (saving) return
    const payload = { question: question.trim(), chapter, chart, exchanges, ...snapshot }
    if (savedId === null) {
      const id = await save(payload)
      if (id !== undefined) setSavedId(id)
    } else {
      await update(savedId, payload)
    }
    setJustSaved(true)
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSave()
        }}
        placeholder="问事，例如：今年换工作顺不顺？"
        className="w-full bg-transparent outline-none"
      />
      <Button
        size="sm"
        className="shrink-0 whitespace-nowrap"
        disabled={saving}
        onClick={() => void handleSave()}
      >
        {justSaved ? '已保存' : saving ? '保存中…' : savedId === null ? '保存到历史' : '更新历史'}
      </Button>
    </div>
  )
}
