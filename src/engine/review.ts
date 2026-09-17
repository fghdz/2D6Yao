import { extractChartTags, extractEvidenceTags, tagLabels } from './chartTags'
import { analyzeEvidence } from './yongshen'
import type { ChartData } from './types'
import type { ReadingExchange } from './llm'

export type OutcomeStatus = 'accurate' | 'partial' | 'wrong'

export const outcomeLabels: Record<OutcomeStatus, string> = {
  accurate: '应验',
  partial: '部分应验',
  wrong: '未应验',
}

/** 应验 → 部分 → 未应验。各处按同一顺序排列，读起来才是一条轴。 */
export const statusOrder: OutcomeStatus[] = ['accurate', 'partial', 'wrong']

/** 事后回填的实际结果：既用来算应验率，也是复盘唯一的原料。 */
export interface ReadingOutcome {
  status: OutcomeStatus
  note: string
  recordedAt: number
}

/**
 * 一次占卜的记录。除卦盘本身，还留了当时的证据快照（标签、用神、并入提示词的条文编号）：
 * 复盘要对照的是**当时**据以判断的依据，事后重算会随引擎版本漂移，就对不上账了。
 */
export interface ReadingRecord {
  id?: number
  question?: string
  label?: string
  chapter?: string
  chart: ChartData
  tagIds?: string[]
  yongshen?: string
  ruleIds?: string[]
  exchanges?: ReadingExchange[]
  outcome?: ReadingOutcome
}

export const errorKinds = [
  'yongshen',
  'strength',
  'yingqi',
  'direction',
  'rule',
  'question',
  'other',
] as const

export type ErrorKind = (typeof errorKinds)[number]

export const errorKindLabels: Record<ErrorKind, string> = {
  yongshen: '用神取错',
  strength: '旺衰误判',
  yingqi: '应期误判',
  direction: '吉凶反了',
  rule: '条文误用',
  question: '问得含糊',
  other: '其他',
}

/**
 * 从未应验的记录反推出来的修正条目 —— 本机自己长出来的「条文」。
 * 权威性低于书中条文：样本少，可能只是巧合，所以可以随时关掉。
 */
export interface Lesson {
  id?: number
  createdAt: number
  title: string
  kind: ErrorKind
  /** 什么样的盘该想起这一条，用卦象标签的话说。 */
  trigger: string
  /** 命中这些标签才并入提示词；留空表示每卦都提醒。 */
  tagIds: string[]
  /** 下次遇到该怎么改。 */
  correction: string
  /** 由哪几条历史记录反推出来。 */
  fromReadingIds: number[]
  enabled: boolean
}

/** 取当时存下的标签快照；旧记录没有快照，只能现算。 */
export function readingTagIds(record: ReadingRecord): string[] {
  if (record.tagIds && record.tagIds.length > 0) return record.tagIds
  // 用神按事类自动取，可能和当时手选的不一样，所以只作旧数据的兜底。
  const evidence = analyzeEvidence(record.chart.liuyao, { chapter: record.chapter || undefined })
  return [...extractChartTags(record.chart.liuyao), ...extractEvidenceTags(evidence)].map(
    (tag) => tag.id,
  )
}

export interface TagRecord {
  tagId: string
  label: string
  counts: Record<OutcomeStatus, number>
  total: number
  /** 应验率，部分应验算半次。 */
  hitRate: number
  /** 未应验率的 Wilson 95% 下界，用来排序。 */
  missLowerBound: number
}

/**
 * Wilson 95% 置信下界。样本少时把估计往下压，
 * 否则「1 卦 1 错 = 100% 不准」会永远排在「10 卦 4 错」前面。
 */
function wilsonLowerBound(successes: number, total: number): number {
  if (total <= 0) return 0
  const z = 1.96
  const p = successes / total
  const denominator = 1 + (z * z) / total
  const centre = p + (z * z) / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)
  return Math.max(0, (centre - margin) / denominator)
}

/**
 * 按卦象标签统计应验情况：哪一类盘上自己断得准，哪一类反复失手。
 * 排序看未应验率的下界，所以榜首是「确实有问题」而不是「只占过一卦」。
 */
export function tagReliability(records: readonly ReadingRecord[]): TagRecord[] {
  const buckets = new Map<string, Record<OutcomeStatus, number>>()

  for (const record of records) {
    const outcome = record.outcome
    if (!outcome) continue
    // 同一标签在一卦里只算一次。
    for (const tagId of new Set(readingTagIds(record))) {
      const counts = buckets.get(tagId) ?? { accurate: 0, partial: 0, wrong: 0 }
      counts[outcome.status] += 1
      buckets.set(tagId, counts)
    }
  }

  return [...buckets]
    .map(([tagId, counts]) => {
      const total = counts.accurate + counts.partial + counts.wrong
      const hits = counts.accurate + counts.partial * 0.5
      return {
        tagId,
        label: tagLabels[tagId as keyof typeof tagLabels] ?? tagId,
        counts,
        total,
        hitRate: hits / total,
        missLowerBound: wilsonLowerBound(total - hits, total),
      }
    })
    .sort(
      (a, b) =>
        b.missLowerBound - a.missLowerBound ||
        b.total - a.total ||
        a.tagId.localeCompare(b.tagId),
    )
}

/**
 * 并入提示词的门槛。回填不到 3 卦的标签记录纯属噪音：
 * 一卦一错就是 0%，全列进去只会把提示词填满「1 卦·0%」，反而淹掉真有苗头的那几条。
 */
export const promptTagRecordMinSample = 3
const promptTagRecordLimit = 6

/** 挑出值得并入提示词的标签记录：本卦有这个标签、样本够、且信号最强的前几条。 */
export function tagRecordsForPrompt(
  records: readonly TagRecord[],
  tagIds: readonly string[],
): TagRecord[] {
  const present = new Set(tagIds)
  return records
    .filter((record) => present.has(record.tagId) && record.total >= promptTagRecordMinSample)
    .slice(0, promptTagRecordLimit)
}

/** 该并入本卦提示词的修正：已启用，且触发标签和本卦有交集（没写标签的算通用提醒）。 */
export function lessonsForTags(
  lessons: readonly Lesson[],
  tagIds: readonly string[],
): Lesson[] {
  const present = new Set(tagIds)
  return lessons.filter(
    (lesson) =>
      lesson.enabled &&
      (lesson.tagIds.length === 0 || lesson.tagIds.some((id) => present.has(id))),
  )
}
