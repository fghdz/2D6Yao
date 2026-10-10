import { useEffect, useMemo, useState } from 'react'
import { extractChartTags, extractEvidenceTags } from '@/engine/chartTags'
import { loadRules, matchRules, type CorpusRule } from '@/engine/corpus'
import { analyzeEvidence } from '@/engine/yongshen'
import { analyzeLatent } from '@/engine/latent'
import { resolveQuestion } from '@/engine/questionType'
import { useChartStore } from '@/store/chartStore'

/** 并入提示词的条文条数上限；保存历史时也只记这么多，复盘才对得上。 */
export const promptRuleLimit = 8

/**
 * 本卦的证据：事类与用神、卦象标签、命中条文、空破伏墓真假。
 * 「解卦」页要它来出提示词，「卦盘」页保存历史时要它来存证据快照，
 * 所以抽成一个 hook —— 两边算出来的必须是同一份，否则复盘时对不上账。
 */
export function useChartEvidence() {
  const { chart, question, chapter, relative } = useChartStore()
  const [rules, setRules] = useState<CorpusRule[] | null>(null)
  const [rulesFailed, setRulesFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadRules().then(
      (loaded) => {
        if (!cancelled) setRules(loaded)
      },
      () => {
        if (!cancelled) setRulesFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  // 没手选事类就从问题推断；用神同理。推断结果只是派生值，不写回 store。
  const resolved = useMemo(
    () => resolveQuestion({ question, chapter, relative }),
    [question, chapter, relative],
  )
  const typeName = resolved.type?.name
  const bookChapter = resolved.type?.bookChapter

  const evidence = useMemo(
    () =>
      chart
        ? analyzeEvidence(chart.liuyao, { chapter: typeName, relative: resolved.relative })
        : null,
    [chart, typeName, resolved.relative],
  )

  const tags = useMemo(
    () =>
      chart && evidence ? [...extractChartTags(chart.liuyao), ...extractEvidenceTags(evidence)] : [],
    [chart, evidence],
  )

  const matches = useMemo(
    () => (rules ? matchRules(rules, tags, bookChapter) : []),
    [rules, tags, bookChapter],
  )

  const latent = useMemo(() => (chart ? analyzeLatent(chart.liuyao) : []), [chart])

  return { rules, rulesFailed, resolved, bookChapter, evidence, tags, matches, latent }
}

/** 存入历史的证据快照：当时实际采用的事类、用神、标签与条文编号。 */
export function evidenceSnapshot({
  resolved,
  tags,
  evidence,
  matches,
}: ReturnType<typeof useChartEvidence>) {
  return {
    chapter: resolved.type?.name ?? '',
    tagIds: tags.map((tag) => tag.id),
    yongshen: evidence?.selectedCandidate?.relative || resolved.relative || undefined,
    ruleIds: matches.slice(0, promptRuleLimit).map((match) => match.rule.id),
  }
}
