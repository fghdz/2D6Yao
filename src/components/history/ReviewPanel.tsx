import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { readingTitle, type SavedReading } from '@/db/db'
import { isConfigured } from '@/engine/aiProvider'
import { loadRules } from '@/engine/corpus'
import { streamReading } from '@/engine/llm'
import {
  buildPostmortemPrompt,
  parseLessons,
  postmortemSystemPrompt,
  toLesson,
} from '@/engine/postmortem'
import { errorKindLabels, tagReliability } from '@/engine/review'
import { addLessons, removeLesson, setLessonEnabled, useLessons } from '@/hooks/useLessons'
import { useSettingsStore } from '@/store/settingsStore'
import { TagReliability } from './TagReliability'

type Status = 'idle' | 'running' | 'done' | 'failed'

/** 一次最多带多少条记录去复盘：再多提示词就爆了，也没必要。 */
const maxMisses = 8
const maxHits = 12

export function ReviewPanel({ readings }: { readings: readonly SavedReading[] }) {
  const ai = useSettingsStore((state) => state.ai)
  const lessons = useLessons()
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [found, setFound] = useState<number | null>(null)

  const verified = useMemo(() => readings.filter((reading) => reading.outcome), [readings])
  const tagRecords = useMemo(() => tagReliability(verified), [verified])
  const titles = useMemo(
    () => new Map(readings.map((reading) => [reading.id, readingTitle(reading)])),
    [readings],
  )

  const misses = verified.filter((reading) => reading.outcome?.status !== 'accurate')
  const hits = verified.filter((reading) => reading.outcome?.status === 'accurate')
  const configured = isConfigured(ai)

  const run = async () => {
    setStatus('running')
    setError('')
    setFound(null)
    try {
      // 复盘要引当时命中的条文原文，所以得把条文库读进来（130KB，按需载入）。
      const rules = await loadRules()
      const sample = [...misses]
        .sort((a, b) => (b.outcome?.recordedAt ?? 0) - (a.outcome?.recordedAt ?? 0))
        .slice(0, maxMisses)
      const contrast = [...hits]
        .sort((a, b) => (b.outcome?.recordedAt ?? 0) - (a.outcome?.recordedAt ?? 0))
        .slice(0, maxHits)

      let answer = ''
      await streamReading(
        {
          config: ai,
          system: postmortemSystemPrompt,
          messages: [{ role: 'user', content: buildPostmortemPrompt(sample, contrast, rules) }],
        },
        {
          onThinking: () => {},
          onText: (delta) => {
            answer += delta
          },
        },
      )

      const known = [...sample, ...contrast]
        .map((reading) => reading.id)
        .filter((id): id is number => id !== undefined)
      const parsed = parseLessons(answer, known)
      setFound(await addLessons(parsed.map(toLesson)))
      setStatus('done')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('failed')
    }
  }

  if (verified.length === 0) {
    return (
      <div className="rounded-md border border-border p-3 text-sm text-text-muted">
        回填过实际结果之后，这里会按卦象统计哪一类盘断得准，并能让 AI 反推当初错在哪一步。
      </div>
    )
  }

  const hint = !configured
    ? '还没配置接口，去「设置」填地址和密钥'
    : misses.length === 0
      ? '目前还没有未应验的记录，没什么可反推的'
      : `拿 ${Math.min(misses.length, maxMisses)} 条失手记录反推，另带 ${Math.min(hits.length, maxHits)} 条已应验作对照`

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-3">
      <TagReliability records={tagRecords} />

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void run()}
            disabled={!configured || misses.length === 0 || status === 'running'}
          >
            {status === 'running' ? '正在复盘…' : 'AI 复盘失手记录'}
          </Button>
          <span className="text-xs text-text-muted">{hint}</span>
        </div>
        {error && <p className="text-sm text-moving">复盘失败：{error}</p>}
        {status === 'done' && (
          <p className="text-sm text-text-muted">
            {found === 0
              ? '没有新的修正 —— 要么样本还太少总结不出规律，要么总结出的和已有的重复。'
              : `新增 ${found} 条修正，低置信度的默认没启用，看过再决定。`}
          </p>
        )}
      </div>

      {lessons.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm text-text-muted">复盘修正</span>
            <span className="text-xs text-text-muted">
              启用的会在命中同类卦象时并入断卦提示词，权重低于书中条文
            </span>
          </div>

          {lessons.map((lesson) => (
            <div key={lesson.id} className="flex flex-col gap-1.5 rounded-md bg-surface px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
                  {errorKindLabels[lesson.kind]}
                </span>
                <span className="text-sm font-medium">{lesson.title}</span>
              </div>
              {lesson.trigger && (
                <p className="text-xs text-text-muted">触发：{lesson.trigger}</p>
              )}
              <p className="text-sm">{lesson.correction}</p>
              {lesson.fromReadingIds.length > 0 && (
                <p className="text-xs text-text-muted">
                  依据：
                  {lesson.fromReadingIds
                    .map((id) => titles.get(id) ?? `记录 #${id}`)
                    .join('、')}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-text-muted">
                  <input
                    type="checkbox"
                    checked={lesson.enabled}
                    onChange={(e) =>
                      lesson.id !== undefined &&
                      void setLessonEnabled(lesson.id, e.target.checked)
                    }
                  />
                  并入断卦
                </label>
                <button
                  onClick={() => lesson.id !== undefined && void removeLesson(lesson.id)}
                  className="text-text-muted hover:text-moving hover:underline"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
