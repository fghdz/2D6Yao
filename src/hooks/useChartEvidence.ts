import { useEffect, useMemo, useState } from 'react'
import { extractChartTags, extractEvidenceTags } from '@/engine/chartTags'
import { loadRules, matchRules, type CorpusRule } from '@/engine/corpus'
import { analyzeEvidence } from '@/engine/yongshen'
import { useChartStore } from '@/store/chartStore'

/** 并入提示词的条文条数上限；保存历史时也只记这么多，复盘才对得上。 */
export const promptRuleLimit = 8

/**
 * 本卦的证据：用神、卦象标签、命中条文。
 * 「解卦」页要它来出提示词，「卦盘」页保存历史时要它来存证据快照，
 * 所以抽成一个 hook —— 两边算出来的必须是同一份，否则复盘时对不上账。
 */
export function useChartEvidence() {
  const { chart, chapter, relative } = useChartStore()
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

  const evidence = useMemo(
    () =>
      chart
        ? analyzeEvidence(chart.liuyao, {
            chapter: chapter || undefined,
            relative: relative || undefined,
          })
        : null,
    [chart, chapter, relative],
  )

  const tags = useMemo(
    () =>
      chart && evidence ? [...extractChartTags(chart.liuyao), ...extractEvidenceTags(evidence)] : [],
    [chart, evidence],
  )

  const matches = useMemo(
    () => (rules ? matchRules(rules, tags, chapter || undefined) : []),
    [rules, tags, chapter],
  )

  return { rules, rulesFailed, evidence, tags, matches }
}

/** 存入历史的证据快照：当时的标签、用神、并入提示词的条文编号。 */
export function evidenceSnapshot({
  tags,
  evidence,
  matches,
}: ReturnType<typeof useChartEvidence>) {
  return {
    tagIds: tags.map((tag) => tag.id),
    yongshen: evidence?.selectedCandidate?.relative || undefined,
    ruleIds: matches.slice(0, promptRuleLimit).map((match) => match.rule.id),
  }
}
