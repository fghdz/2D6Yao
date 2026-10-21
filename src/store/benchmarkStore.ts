import { create } from 'zustand'
import { db, readingTitle, type SavedReading } from '@/db/db'
import type { AiConfig } from '@/engine/aiProvider'
import { benchmarkCases, type BenchmarkResult, type BenchmarkRun } from '@/engine/benchmark'
import { loadCases, loadRules } from '@/engine/corpus'
import { streamReading } from '@/engine/llm'
import { buildReadingPrompt, computeEvidence } from '@/engine/readingContext'
import { parseVerdict } from '@/engine/verdict'
import { appVersion } from '@/lib/appVersion'

/** 两次调用之间稍停：免费档多半有每分钟次数限制。 */
const pauseMs = 1500

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 这几种错误再跑下去也是白跑：额度用完、密钥不对。 */
const fatal = (message: string) => /\b(401|403|429)\b|rate.?limit|quota|insufficient/i.test(message)

interface BenchmarkStore {
  runningId: number | null
  current: string
  done: number
  total: number
  error: string
  controller: AbortController | null
  /** 新开一轮；已在跑就不动。 */
  start: (ai: AiConfig) => Promise<void>
  /** 接着跑一轮没跑完的（中途停了、或额度用完第二天再跑）。 */
  resume: (runId: number, ai: AiConfig) => Promise<void>
  stop: () => void
}

/**
 * 回测跑在模块级的 store 里，而不是组件里：
 * 几十卦要跑好几分钟，中途切到别的页面也不该断。
 */
export const useBenchmarkStore = create<BenchmarkStore>((set, get) => {
  async function run(runId: number, ai: AiConfig) {
    const controller = new AbortController()
    set({ runningId: runId, controller, error: '', current: '' })
    try {
      const [rules, corpus] = await Promise.all([loadRules(), loadCases()])
      const record = await db.runs.get(runId)
      if (!record) return
      const readings = (await db.readings.bulkGet(record.caseIds)).filter(
        (reading): reading is SavedReading => reading !== undefined,
      )
      // 跑过且没出错的跳过，出错的重跑。
      const finished = new Set(record.results.filter((r) => !r.error).map((r) => r.readingId))
      set({ total: record.caseIds.length, done: finished.size })

      for (const reading of readings) {
        if (controller.signal.aborted) break
        if (reading.id === undefined || finished.has(reading.id) || !reading.outcome?.actual) continue
        const question = reading.question || reading.label || ''
        set({ current: readingTitle(reading) })

        let result: BenchmarkResult
        try {
          // 回测不并入本机战绩与复盘修正：那些是用这批题的答案算出来的，等于拿答案考自己。
          const bundle = computeEvidence({
            chart: reading.chart,
            question,
            chapter: reading.chapter || undefined,
            rules,
          })
          const { prompt } = buildReadingPrompt(reading.chart, question, bundle, {
            cases: corpus,
            blind: true,
          })
          let answer = ''
          await streamReading(
            { config: ai, messages: [{ role: 'user', content: prompt }], signal: controller.signal },
            { onThinking: () => {}, onText: (delta) => (answer += delta) },
          )
          result = {
            readingId: reading.id,
            verdict: parseVerdict(answer),
            actual: reading.outcome.actual,
            answer,
          }
        } catch (cause) {
          if (controller.signal.aborted) break
          const message = cause instanceof Error ? cause.message : String(cause)
          result = { readingId: reading.id, verdict: null, actual: reading.outcome.actual, answer: '', error: message }
          if (fatal(message)) {
            await saveResult(runId, result)
            set({ error: `已暂停：${message.slice(0, 160)}。额度恢复后点「继续」接着跑。` })
            break
          }
        }

        await saveResult(runId, result)
        if (!result.error) set((state) => ({ done: state.done + 1 }))
        await sleep(pauseMs)
      }

      const latest = await db.runs.get(runId)
      if (latest && latest.results.filter((r) => !r.error).length >= latest.caseIds.length) {
        await db.runs.update(runId, { finishedAt: Date.now() })
      }
    } catch (cause) {
      set({ error: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      set({ runningId: null, controller: null, current: '' })
    }
  }

  return {
    runningId: null,
    current: '',
    done: 0,
    total: 0,
    error: '',
    controller: null,
    start: async (ai) => {
      if (get().runningId !== null) return
      const readings = await db.readings.toArray()
      const cases = benchmarkCases(readings)
      if (cases.length === 0) return
      const runId = await db.runs.add({
        startedAt: Date.now(),
        model: ai.model,
        provider: ai.presetId,
        appVersion,
        caseIds: cases.map((reading) => reading.id as number),
        results: [],
      } satisfies BenchmarkRun)
      if (runId !== undefined) await run(runId, ai)
    },
    resume: async (runId, ai) => {
      if (get().runningId !== null) return
      await run(runId, ai)
    },
    stop: () => get().controller?.abort(),
  }
})

/** 同一卦重跑时替换旧结果，不重复累加。 */
async function saveResult(runId: number, result: BenchmarkResult) {
  await db.transaction('rw', db.runs, async () => {
    const run = await db.runs.get(runId)
    if (!run) return
    const results = run.results.filter((item) => item.readingId !== result.readingId)
    await db.runs.update(runId, { results: [...results, result] })
  })
}
