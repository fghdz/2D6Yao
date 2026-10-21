import { useEffect, useMemo, useState } from 'react'
import { loadRules, type CorpusRule } from '@/engine/corpus'
import { computeEvidence, promptRuleLimit, type ChartEvidenceBundle } from '@/engine/readingContext'
import { useChartStore } from '@/store/chartStore'

export { promptRuleLimit }

/**
 * 本卦的证据。「解卦」页要它来出提示词，「卦盘」页保存历史时要它来存证据快照，
 * 两边算出来的必须是同一份，否则复盘时对不上账；计算本身在 engine/readingContext。
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

  const bundle = useMemo(
    () => (chart ? computeEvidence({ chart, question, chapter, relative, rules }) : null),
    [chart, question, chapter, relative, rules],
  )

  return { rules, rulesFailed, bundle }
}

/** 存入历史的证据快照：当时实际采用的事类、用神、标签与条文编号。 */
export function evidenceSnapshot(bundle: ChartEvidenceBundle | null) {
  if (!bundle) return {}
  return {
    chapter: bundle.resolved.type?.name ?? '',
    tagIds: bundle.tags.map((tag) => tag.id),
    yongshen:
      bundle.evidence.selectedCandidate?.relative || bundle.resolved.relative || undefined,
    ruleIds: bundle.matches.slice(0, promptRuleLimit).map((match) => match.rule.id),
  }
}
