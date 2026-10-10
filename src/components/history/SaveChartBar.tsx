import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useHistory } from '@/hooks/useHistory'
import { evidenceSnapshot, useChartEvidence } from '@/hooks/useChartEvidence'
import { useChartStore } from '@/store/chartStore'
import { db } from '@/db/db'
import type { ReadingExchange } from '@/engine/llm'

/** 主断语是第一轮（整卦解读）；追问不改变当初的判断。 */
const mainAnswer = (list?: readonly ReadingExchange[]) => list?.[0]?.answer ?? ''

export function SaveChartBar() {
  const { save, update, saving } = useHistory()
  const { chart, question, exchanges, savedId, setQuestion, setSavedId } = useChartStore()
  // 存下当时实际采用的事类、用神、标签与条文，复盘才能对照**当时**的判断依据。
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
    const payload = { question: question.trim(), chart, exchanges, ...snapshot }
    if (savedId === null) {
      const id = await save(payload)
      if (id !== undefined) setSavedId(id)
    } else {
      // 重新断过卦：旧的应验评定评的是旧断语，标记过期，实际经过照留，等重新评定。
      const existing = await db.readings.get(savedId)
      const rejudged =
        existing?.outcome && mainAnswer(existing.exchanges) !== mainAnswer(exchanges)
      await update(
        savedId,
        rejudged && existing.outcome
          ? { ...payload, outcome: { ...existing.outcome, stale: true } }
          : payload,
      )
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
