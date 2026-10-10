import type { ChartTag } from './chartTags'

/** 《六爻800例》抽出的断法条文，见 SCHEMA.md `corpus/rules.jsonl`。 */
export interface CorpusRule {
  id: string
  chapter: string
  chapter_name: string
  section: string
  topic: string
  index: number
  text: string
  tags: string[]
  example_cases: number[]
}

/** 书中卦例，见 SCHEMA.md `corpus/cases.jsonl`。 */
export interface CorpusCase {
  seq: number
  chapter_name: string
  page: number
  sizhu: { year: string; month: string; day: string; hour: string }
  xunkong: string[]
  question_raw: string
  analysis: string
  note: string | null
  yingqi: Array<{ ganzhi: string; text: string }>
  tags: string[]
  tag_detail?: Record<string, string[]>
  gua?: {
    ben: string
    bian?: string
    dong_yao: number[]
    gong: string
    confidence: 'high' | 'medium' | 'low' | 'review' | null
  }
}

export interface RuleMatch {
  rule: CorpusRule
  sharedTags: string[]
  score: number
}

export interface CaseMatch {
  entry: CorpusCase
  sharedTags: string[]
  sameHexagram: boolean
  score: number
}

let cache: CorpusRule[] | null = null

/** 条文库约 130KB，按需载入，不进主包。 */
export async function loadRules(): Promise<CorpusRule[]> {
  if (!cache) {
    const { default: raw } = await import('../../data/rules.jsonl?raw')
    cache = raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CorpusRule)
  }
  return cache
}

let caseCache: CorpusCase[] | null = null

/** 卦例库约 1.8MB，只有用到书例检索才下载。 */
export async function loadCases(): Promise<CorpusCase[]> {
  if (!caseCache) {
    const { default: raw } = await import('../../data/cases.jsonl?raw')
    caseCache = raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CorpusCase)
  }
  return caseCache
}

function inverseFrequency(documents: ReadonlyArray<{ tags: string[] }>) {
  const counts = new Map<string, number>()
  for (const doc of documents) {
    for (const tag of doc.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return (tag: string) => Math.log(documents.length / (1 + (counts.get(tag) ?? 0)))
}

/** 卦盘识别置信度折扣：`review` 的卦名本来就存疑，不该因为「同卦」排到最前。 */
const confidenceWeight: Record<string, number> = {
  high: 1,
  medium: 0.7,
  low: 0.4,
  review: 0.2,
}

/**
 * 检索相似书例：同本卦最重（同卦不同断最见功夫），其次标签重合，同事类再加成。
 */
export function matchCases(
  cases: readonly CorpusCase[],
  tags: readonly ChartTag[],
  hexagramName: string,
  chapterName?: string,
): CaseMatch[] {
  const tagIds = new Set<string>(tags.map((tag) => tag.id))
  const weightOf = inverseFrequency(cases)

  return cases
    .map((entry) => {
      const sharedTags = entry.tags.filter((tag) => tagIds.has(tag))
      const hexagramMatches = entry.gua?.ben === hexagramName
      const confidence = entry.gua?.confidence ?? ''
      // 只有卦名认得准的才算「同本卦」；low/review 仅加分，不参与置顶。
      const sameHexagram =
        hexagramMatches && (confidence === 'high' || confidence === 'medium')
      // 除以标签数开方：书里有些长篇卦例挂了三十多个标签，不归一化就会盖过一切。
      const tagScore =
        sharedTags.reduce((total, tag) => total + weightOf(tag), 0) /
        Math.sqrt(Math.max(entry.tags.length, 1))
      const score =
        tagScore +
        (hexagramMatches ? 3 * (confidenceWeight[confidence] ?? 0) : 0) +
        (chapterName && entry.chapter_name === chapterName ? 0.8 : 0)
      return { entry, sharedTags, sameHexagram, score }
    })
    .filter((match) => match.sameHexagram || match.sharedTags.length > 1)
    .sort(
      (a, b) =>
        Number(b.sameHexagram) - Number(a.sameHexagram) ||
        b.score - a.score ||
        a.entry.seq - b.entry.seq,
    )
}

/**
 * 按标签重合度排条文，同章优先。
 * 用逆频率加权：「旺相」「衰弱」这类几乎条条都挂的标签权重低，
 * 「反吟」「三合局」这类少见标签权重高，避免匹配结果被通用条文淹没。
 */
export function matchRules(
  rules: readonly CorpusRule[],
  tags: readonly ChartTag[],
  chapterName?: string,
): RuleMatch[] {
  const tagIds = new Set<string>(tags.map((tag) => tag.id))
  const weightOf = inverseFrequency(rules)

  return rules
    .filter((rule) => !chapterName || rule.chapter_name === chapterName)
    .map((rule) => {
      const sharedTags = rule.tags.filter((tag) => tagIds.has(tag))
      const score = sharedTags.reduce((total, tag) => total + weightOf(tag), 0)
      return { rule, sharedTags, score }
    })
    .filter((match) => match.sharedTags.length > 0)
    .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id))
}
