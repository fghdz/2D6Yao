import { hasChangedHexagram } from './liuyao'
import { tagLabels } from './chartTags'
import { errorKinds, errorKindLabels, outcomeLabels, readingKind, readingTagIds } from './review'
import { questionKindLabels } from './questionType'
import type { CorpusRule } from './corpus'
import type { ErrorKind, Lesson, ReadingRecord } from './review'

export const postmortemSystemPrompt = [
  '你是六爻断卦的复盘者。给你的是同一个人的占卦记录与事后回填的真实结果。',
  '你的任务不是重新断卦，也不要给新的吉凶结论，而是反推当初断错在哪一步，并把能复用的部分写成下次断卦时的自我提醒。',
  '样本很少，多数「不准」很可能只是巧合。宁可少给甚至一条不给，也不要硬凑规律 —— 凑出来的修正会一直污染以后每一卦。',
  '只输出要求的 JSON，不要寒暄，不要在 JSON 之外解释。',
].join('\n')

/** LLM 反推出来的一条修正，字段和 Lesson 对齐但一律当作不可信输入校验。 */
export interface ParsedLesson {
  title: string
  kind: ErrorKind
  trigger: string
  tagIds: string[]
  correction: string
  fromReadingIds: number[]
  confidence: 'high' | 'low'
}

const maxVerdict = 900
const maxNote = 400
const maxRuleText = 140
const maxRulesPerReading = 4

function truncate(text: string, limit: number): string {
  const clean = text.trim().replace(/\s*\n\s*/g, ' ')
  return clean.length <= limit ? clean : `${clean.slice(0, limit)}……`
}

function title(record: ReadingRecord): string {
  return record.question || record.label || record.chart.liuyao.originalName
}

/** 取最后一轮断语：追问之后的结论才是当时真正落到的判断。 */
function verdictOf(record: ReadingRecord): string {
  const answers = (record.exchanges ?? []).map((exchange) => exchange.answer).filter(Boolean)
  return answers.length > 0 ? truncate(answers[answers.length - 1], maxVerdict) : ''
}

const namedTags = (tagIds: readonly string[]) =>
  tagIds.map((id) => `${tagLabels[id as keyof typeof tagLabels] ?? id}(${id})`).join('、')

function describe(record: ReadingRecord, rulesById: Map<string, CorpusRule>): string[] {
  const { liuyao } = record.chart
  const tagIds = readingTagIds(record)
  const lines = [
    `--- 记录 #${record.id} ---`,
    `问事：${title(record)}（${questionKindLabels[readingKind(record)]}）`,
    `卦：${liuyao.originalName}${hasChangedHexagram(liuyao) ? ` → ${liuyao.changedName}` : '（静卦）'}` +
      `${record.chapter ? ` · 事类 ${record.chapter}` : ''}${record.yongshen ? ` · 用神 ${record.yongshen}` : ''}`,
    `卦象标签：${namedTags(tagIds)}`,
  ]

  const cited = (record.ruleIds ?? [])
    .map((id) => rulesById.get(id))
    .filter((rule): rule is CorpusRule => rule != null)
    .slice(0, maxRulesPerReading)
  if (cited.length > 0) {
    lines.push('当时并入的条文：')
    for (const rule of cited) lines.push(`  [${rule.id}] ${truncate(rule.text, maxRuleText)}`)
  }

  const verdict = verdictOf(record)
  lines.push(verdict ? `当时的断语：${verdict}` : '当时没存下断语。')

  const outcome = record.outcome
  if (outcome) {
    lines.push(
      `实际结果：${outcomeLabels[outcome.status]}${outcome.note ? ` —— ${truncate(outcome.note, maxNote)}` : '（没写具体经过）'}`,
    )
  }
  return lines
}

/**
 * 复盘提示词。两处关键设计：
 * 1. 已应验的记录也要给（只给摘要），否则模型只看失手案例，反推出的修正会把本来断对的卦一并推翻；
 * 2. 触发条件限定只能用出现过的标签 id，程序才能在下次遇到同类盘时自动并入提示词。
 */
export function buildPostmortemPrompt(
  misses: readonly ReadingRecord[],
  hits: readonly ReadingRecord[],
  rules: readonly CorpusRule[],
): string {
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]))
  const lines: string[] = []

  lines.push(
    `以下是本机 ${misses.length + hits.length} 条已回填实际结果的占卦记录。`,
    '请从未应验与部分应验的几条里反推：当初断错在哪一步，能不能总结成可复用的修正。',
    '',
    '【未应验 / 部分应验】',
  )
  for (const record of misses) lines.push(...describe(record, rulesById), '')

  if (hits.length > 0) {
    lines.push('【已应验 —— 作为对照，修正不能把这些卦一并推翻】')
    for (const record of hits) {
      const tagIds = readingTagIds(record)
      lines.push(
        `#${record.id} ${title(record)} · ${record.chart.liuyao.originalName}` +
          `${record.yongshen ? ` · 用神 ${record.yongshen}` : ''} · 标签：${namedTags(tagIds)}`,
      )
    }
    lines.push('')
  }

  // 触发标签只提供有区分度的：持世、世应关系这类每盘都有的标签当触发条件等于「每卦都提醒」，
  // 那条修正就永远在提示词里，反而盖掉真正相关的那几条。按出现频率筛掉，不靠我拍脑袋列名单。
  const all = [...misses, ...hits]
  const frequency = new Map<string, number>()
  for (const record of all) {
    for (const id of new Set(readingTagIds(record))) {
      frequency.set(id, (frequency.get(id) ?? 0) + 1)
    }
  }
  const discriminating = [...frequency]
    .filter(([, count]) => count / all.length < 0.8)
    .map(([id]) => id)
  const vocabulary = discriminating.length > 0 ? discriminating : [...frequency.keys()]

  lines.push(
    '要求：',
    `1. 先判断每条失手错在哪一步：${errorKinds.map((kind) => `${errorKindLabels[kind]}(${kind})`).join(' / ')}。`,
    '2. 只在看出可复用的规律时才给修正：至少两条记录指向同一步，或某一条里能明确定位到是哪条条文、哪次取用神有误。',
    '   看不出规律就返回空数组 —— 这是正常结果，不是失败。',
    '3. 每条修正必须能解释失手的那几卦，同时不能推翻已应验的那几卦；两者不能兼顾就不要给。',
    '4. trigger 用大白话写「什么样的盘该想起这一条」；tagIds 只能从下面这些标签里挑（下次遇到带这些标签的盘才会提醒）：',
    `   ${namedTags(vocabulary)}`,
    '5. correction 写「下次遇到这种盘该怎么改」，要具体到可执行，不要写「应综合判断」这类空话。',
    '6. confidence：两条以上记录支持且机理说得通写 high，只有一条记录或只是猜测写 low。',
    '7. 只输出一个 JSON 代码块：',
    '```json',
    '{"lessons":[{"title":"一句话标题","kind":"yongshen","trigger":"...","tagIds":["xunkong"],"correction":"...","fromReadingIds":[12],"confidence":"high"}]}',
    '```',
  )

  return lines.join('\n')
}

/** 从回答里挖出 JSON：免费模型常在前后加解释、加多余的代码块。 */
function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((match) => match[1])
  const candidates = [...fenced, text]

  for (const candidate of candidates) {
    const start = candidate.search(/[{[]/)
    if (start < 0) continue
    // 从第一个括号起做一次括号配对，拿到完整的那一段，忽略后面的碎片。
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < candidate.length; i++) {
      const char = candidate[i]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') inString = true
      else if (char === '{' || char === '[') depth += 1
      else if (char === '}' || char === ']') {
        depth -= 1
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1))
          } catch {
            break
          }
        }
      }
    }
  }
  return null
}

const isErrorKind = (value: unknown): value is ErrorKind =>
  typeof value === 'string' && (errorKinds as readonly string[]).includes(value)

/** 一律当不可信输入处理：字段缺失就丢掉这条，标签与记录号只留真实存在的。 */
export function parseLessons(text: string, knownReadingIds: readonly number[]): ParsedLesson[] {
  const parsed = extractJson(text)
  const raw = Array.isArray(parsed)
    ? parsed
    : ((parsed as { lessons?: unknown })?.lessons ?? null)
  if (!Array.isArray(raw)) return []

  const validIds = new Set(knownReadingIds)
  const lessons: ParsedLesson[] = []

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    const correction = typeof entry.correction === 'string' ? entry.correction.trim() : ''
    if (correction.length === 0) continue

    const tagIds = Array.isArray(entry.tagIds)
      ? entry.tagIds.filter(
          (id): id is string => typeof id === 'string' && id in tagLabels,
        )
      : []
    const fromReadingIds = Array.isArray(entry.fromReadingIds)
      ? entry.fromReadingIds.filter(
          (id): id is number => typeof id === 'number' && validIds.has(id),
        )
      : []

    lessons.push({
      title:
        typeof entry.title === 'string' && entry.title.trim().length > 0
          ? entry.title.trim()
          : truncate(correction, 24),
      kind: isErrorKind(entry.kind) ? entry.kind : 'other',
      trigger: typeof entry.trigger === 'string' ? entry.trigger.trim() : '',
      tagIds: [...new Set(tagIds)],
      correction,
      fromReadingIds: [...new Set(fromReadingIds)],
      confidence: entry.confidence === 'high' ? 'high' : 'low',
    })
  }

  return lessons
}

/** 低置信度的默认不启用：先摆在那里让人看过再说，别一上来就影响每一卦。 */
export function toLesson(parsed: ParsedLesson): Omit<Lesson, 'id'> {
  return {
    createdAt: Date.now(),
    title: parsed.title,
    kind: parsed.kind,
    trigger: parsed.trigger,
    tagIds: parsed.tagIds,
    correction: parsed.correction,
    fromReadingIds: parsed.fromReadingIds,
    enabled: parsed.confidence === 'high',
  }
}
