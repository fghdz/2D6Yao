import { extractChartTags, extractEvidenceTags } from './chartTags'
import { matchCases, matchRules, type CorpusCase, type CorpusRule } from './corpus'
import { analyzeLatent } from './latent'
import { buildChartPrompt } from './promptBuilder'
import { isNearTerm, resolveQuestion, type SixRelative } from './questionType'
import type { Lesson, TagRecord } from './review'
import type { ChartData } from './types'
import { analyzeEvidence } from './yongshen'

/** 并入提示词的条文条数上限；保存历史时也只记这么多，复盘才对得上。 */
export const promptRuleLimit = 8
const caseCount = 3

/**
 * 一卦的全部证据：事类与用神、卦象标签、命中条文、空破伏墓真假。
 * 「解卦」页、保存历史、回测三处都从这里算 —— 回测测的必须是用户平时看到的同一份提示词，
 * 否则回测成绩说明不了日常断卦的准不准。
 */
export function computeEvidence(input: {
  chart: ChartData
  question: string
  chapter?: string
  relative?: SixRelative | ''
  rules?: readonly CorpusRule[] | null
}) {
  const resolved = resolveQuestion({
    question: input.question,
    chapter: input.chapter,
    relative: input.relative,
  })
  const bookChapter = resolved.type?.bookChapter
  const evidence = analyzeEvidence(input.chart.liuyao, {
    chapter: resolved.type?.name,
    relative: resolved.relative,
  })
  const tags = [...extractChartTags(input.chart.liuyao), ...extractEvidenceTags(evidence)]
  const matches = input.rules ? matchRules(input.rules, tags, bookChapter) : []
  const latent = analyzeLatent(input.chart.liuyao)
  return { resolved, bookChapter, evidence, tags, matches, latent }
}

export type ChartEvidenceBundle = ReturnType<typeof computeEvidence>

export function buildReadingPrompt(
  chart: ChartData,
  question: string,
  bundle: ChartEvidenceBundle,
  options: {
    visibleRules?: number
    cases?: readonly CorpusCase[] | null
    lessons?: readonly Lesson[]
    tagRecords?: readonly TagRecord[]
    /** 回测用：去掉与本卦同日同卦的书例，免得把答案喂给模型。 */
    blind?: boolean
  } = {},
) {
  const { resolved } = bundle
  const { liuyao } = chart
  const sameChart = (entry: CorpusCase) =>
    entry.gua?.ben === liuyao.originalName &&
    entry.sizhu.day === liuyao.ganzhi.day &&
    entry.sizhu.month === liuyao.ganzhi.month
  const caseMatches = options.cases
    ? matchCases(options.cases, bundle.tags, liuyao.originalName, bundle.bookChapter)
        .filter((match) => !(options.blind && sameChart(match.entry)))
        .slice(0, caseCount)
    : []
  const prompt = buildChartPrompt(chart, {
    question: question.trim() || undefined,
    questionType: resolved.type
      ? `${resolved.type.name}（${resolved.typeSource === 'chosen' ? '手选' : '据问题推断'}；${resolved.type.yongshenNote}）`
      : undefined,
    nearTerm: isNearTerm(question),
    evidence: bundle.evidence,
    latent: bundle.latent,
    tags: bundle.tags,
    matches: bundle.matches.slice(0, options.visibleRules ?? promptRuleLimit),
    cases: caseMatches,
    lessons: options.lessons,
    tagRecords: options.tagRecords,
  })
  return { prompt, caseMatches }
}
