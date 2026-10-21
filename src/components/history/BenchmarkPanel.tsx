import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/components/ui/button'
import { db, readingTitle, type SavedReading } from '@/db/db'
import { isConfigured } from '@/engine/aiProvider'
import {
  benchmarkCases,
  summarizeRun,
  unlabelledCases,
  type BenchmarkRun,
  type RunSummary,
} from '@/engine/benchmark'
import { outcomeLabels } from '@/engine/review'
import { verdictLabels } from '@/engine/verdict'
import { useBenchmarkStore } from '@/store/benchmarkStore'
import { useSettingsStore } from '@/store/settingsStore'

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

/** 拿区间和「一律判吉」比：区间整个在上面才算真好过它，跨着它就是分不出来。 */
function comparison(summary: RunSummary): string {
  if (summary.accuracy === null || summary.alwaysGood === null) return ''
  const [low, high] = summary.interval
  if (low > summary.alwaysGood) return '明显好过一律判吉'
  if (high < summary.alwaysGood) return '明显不如一律判吉'
  return '和一律判吉分不出高下 —— 样本还不够，或者确实没有区别'
}

export function BenchmarkPanel({ readings }: { readings: readonly SavedReading[] }) {
  const ai = useSettingsStore((state) => state.ai)
  const { runningId, current, done, total, error, start, resume, stop } = useBenchmarkStore()
  const runs = useLiveQuery(() => db.runs.orderBy('startedAt').reverse().toArray(), []) ?? []
  const [labelling, setLabelling] = useState(false)

  const cases = benchmarkCases(readings)
  const unlabelled = unlabelledCases(readings)
  const configured = isConfigured(ai)

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-text-muted">回测</span>
        <p className="text-xs text-text-muted">
          用现在的规则和模型，把记了实际吉凶的是非题重新断一遍，自动评分，并和「一律判吉」这条底线比。
          不并入本机战绩与复盘修正 —— 那些是用这批题的答案算出来的，等于拿答案考自己。不会改动你的历史断语。
        </p>
      </div>

      {unlabelled.length > 0 && !labelling && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setLabelling(true)}>
          补记实际吉凶（还差 {unlabelled.length} 道）
        </Button>
      )}
      {labelling && <LabellingQueue cases={unlabelled} onClose={() => setLabelling(false)} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => void start(ai)}
          disabled={!configured || cases.length === 0 || runningId !== null}
        >
          {runningId !== null ? '正在回测…' : `开始回测（${cases.length} 道）`}
        </Button>
        {runningId !== null && (
          <Button size="sm" variant="outline" onClick={stop}>
            停止
          </Button>
        )}
        <span className="text-xs text-text-muted">
          {!configured
            ? '先去「设置」配好接口'
            : cases.length === 0
              ? '还没有记了实际吉凶的是非题'
              : `模型：${ai.model}，每道题调用一次接口`}
        </span>
      </div>

      {runningId !== null && (
        <p className="text-xs text-text-muted">
          正在断：{current || '准备中'}（{done}/{total}）
        </p>
      )}
      {error && <p className="text-xs text-moving">{error}</p>}

      {runs.map((run) => (
        <RunCard
          key={run.id}
          run={run}
          readings={readings}
          running={runningId === run.id}
          canResume={runningId === null && configured}
          onResume={() => run.id !== undefined && void resume(run.id, ai)}
        />
      ))}
    </div>
  )
}

function RunCard({
  run,
  readings,
  running,
  canResume,
  onResume,
}: {
  run: BenchmarkRun
  readings: readonly SavedReading[]
  running: boolean
  canResume: boolean
  onResume: () => void
}) {
  const [open, setOpen] = useState(false)
  const summary = summarizeRun(run)
  const titles = new Map(readings.map((reading) => [reading.id, readingTitle(reading)]))
  const unfinished = !run.finishedAt && !running

  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-surface px-3 py-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-text-muted">
        <span>{new Date(run.startedAt).toLocaleString('zh-CN')}</span>
        <span>· {run.model}</span>
        <span>· 版本 {run.appVersion}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-lg font-medium">{percent(summary.accuracy)}</span>
        <span>
          判对 {summary.correct} / {summary.decided}
        </span>
        {summary.decided > 0 && (
          <span className="text-xs text-text-muted">
            （95% 区间 {percent(summary.interval[0])}–{percent(summary.interval[1])}）
          </span>
        )}
      </div>
      {summary.decided > 0 && (
        <>
          <p className="text-xs">
            同一批题一律判吉：{percent(summary.alwaysGood)} · {comparison(summary)}
          </p>
          <p className="text-xs text-text-muted">
            判吉 {summary.saidGood.total} 次对 {summary.saidGood.correct} · 判凶 {summary.saidBad.total} 次对{' '}
            {summary.saidBad.correct}
            {summary.unclear > 0 ? ` · 难断 ${summary.unclear}` : ''}
            {summary.missing > 0 ? ` · 没写结论 ${summary.missing}` : ''}
            {summary.errors > 0 ? ` · 出错 ${summary.errors}` : ''}
          </p>
        </>
      )}
      <p className="text-xs text-text-muted">
        已跑 {summary.done} / {summary.total}
        {running ? '，进行中' : run.finishedAt ? '，已完成' : '，未跑完'}
      </p>

      <div className="flex flex-wrap gap-2">
        {unfinished && (
          <Button size="sm" variant="outline" onClick={onResume} disabled={!canResume}>
            继续
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
          {open ? '收起明细' : '逐题明细'}
        </Button>
        {!running && (
          <Button size="sm" variant="ghost" onClick={() => run.id !== undefined && void db.runs.delete(run.id)}>
            删除
          </Button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          {[...run.results]
            .sort((a, b) => a.readingId - b.readingId)
            .map((result) => {
              const right =
                result.verdict === 'good' || result.verdict === 'bad'
                  ? result.verdict === result.actual
                  : null
              return (
                <details key={result.readingId} className="text-xs">
                  <summary className="cursor-pointer">
                    {right === null ? '·' : right ? '✓' : '✗'} {titles.get(result.readingId) ?? `#${result.readingId}`}
                    <span className="text-text-muted">
                      {' '}
                      — 断{result.verdict ? verdictLabels[result.verdict] : '（无结论）'}，实际
                      {verdictLabels[result.actual]}
                      {result.error ? `，出错：${result.error.slice(0, 60)}` : ''}
                    </span>
                  </summary>
                  {result.answer && (
                    <p className="mt-1 whitespace-pre-wrap text-text-muted">{result.answer}</p>
                  )}
                </details>
              )
            })}
        </div>
      )}
    </div>
  )
}

/**
 * 一道一道补记实际吉凶。旧记录只有「应验 / 未应验」，评的是旧断语对不对；
 * 回测要的是事实本身 —— 看着当时写下的经过点一下吉或凶就行。
 */
function LabellingQueue({ cases, onClose }: { cases: readonly SavedReading[]; onClose: () => void }) {
  const [skipped, setSkipped] = useState<number[]>([])
  const pending = cases.filter((reading) => !skipped.includes(reading.id ?? -1))
  const reading = pending[0]

  if (!reading) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-surface px-3 py-2 text-sm">
        <span>都补完了{skipped.length > 0 ? `（跳过 ${skipped.length} 道）` : ''}。</span>
        <Button size="sm" variant="ghost" onClick={onClose}>
          收起
        </Button>
      </div>
    )
  }

  const record = async (actual: 'good' | 'bad') => {
    if (reading.id === undefined || !reading.outcome) return
    await db.readings.update(reading.id, { outcome: { ...reading.outcome, actual } })
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-surface px-3 py-2 text-sm">
      <span className="text-xs text-text-muted">还差 {pending.length} 道 · 实际结果对问卦人是吉还是凶？</span>
      <span className="font-medium">{readingTitle(reading)}</span>
      <p className="whitespace-pre-wrap text-text-muted">
        {reading.outcome?.note || '（当时没写经过）'}
      </p>
      {reading.outcome?.status && (
        <p className="text-xs text-text-muted">当时的评定：{outcomeLabels[reading.outcome.status]}（评的是断语，不是事实）</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void record('good')}>
          吉
        </Button>
        <Button size="sm" variant="outline" onClick={() => void record('bad')}>
          凶
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => reading.id !== undefined && setSkipped([...skipped, reading.id])}
        >
          看不出，跳过
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          先到这里
        </Button>
      </div>
    </div>
  )
}
