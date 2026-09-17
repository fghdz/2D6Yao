import { useEffect, useMemo, useState } from 'react'
import { useChart } from '@/hooks/useChart'
import { promptRuleLimit, useChartEvidence } from '@/hooks/useChartEvidence'
import { useHistory } from '@/hooks/useHistory'
import { useLessons } from '@/hooks/useLessons'
import { listChapters, loadCases, matchCases, type CorpusCase } from '@/engine/corpus'
import { lessonsForTags, tagRecordsForPrompt, tagReliability } from '@/engine/review'
import { sixRelatives, type SixRelative } from '@/engine/yongshen'
import { Button } from '@/components/ui/button'
import { YongshenPanel } from './YongshenPanel'
import { ChartTagList } from './ChartTagList'
import { RuleMatches } from './RuleMatches'
import { CaseMatches } from './CaseMatches'
import { PromptPreview } from './PromptPreview'
import { AIReadingPanel } from './AIReadingPanel'
import { buildChartPrompt } from '@/engine/promptBuilder'

const pageSize = promptRuleLimit
const caseCount = 3

export function InterpretationPanel() {
  const { chart, question, chapter, relative, setQuestion, setChapter, setRelative } = useChart()
  const { rules, rulesFailed, evidence, tags, matches } = useChartEvidence()
  const { readings } = useHistory()
  const lessons = useLessons()
  const [cases, setCases] = useState<CorpusCase[] | null>(null)
  const [casesFailed, setCasesFailed] = useState(false)
  const [visible, setVisible] = useState(pageSize)

  useEffect(() => {
    let cancelled = false
    loadCases().then(
      (loaded) => {
        if (!cancelled) setCases(loaded)
      },
      () => {
        if (!cancelled) setCasesFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const shown = matches.slice(0, visible)
  const caseMatches = useMemo(
    () =>
      cases && chart
        ? matchCases(cases, tags, chart.liuyao.originalName, chapter || undefined).slice(
            0,
            caseCount,
          )
        : [],
    [cases, chart, tags, chapter],
  )

  // 本机战绩反馈：只把与本卦相关的那几条修正与标签记录并进提示词。
  const tagIds = useMemo(() => tags.map((tag) => tag.id), [tags])
  const applicable = useMemo(() => lessonsForTags(lessons, tagIds), [lessons, tagIds])
  const tagRecords = useMemo(
    () => tagRecordsForPrompt(tagReliability(readings.filter((reading) => reading.outcome)), tagIds),
    [readings, tagIds],
  )

  if (!chart) {
    return <p className="text-sm text-text-muted">还没有卦盘，先去「起卦」生成一个。</p>
  }

  const prompt = buildChartPrompt(chart, {
    question: question.trim() || undefined,
    questionType: chapter || undefined,
    evidence: evidence ?? undefined,
    tags,
    matches: shown,
    cases: caseMatches,
    lessons: applicable,
    tagRecords,
  })

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
        <span className="shrink-0 text-text-muted">问事</span>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="先写下要问什么，例如：这份工作该不该接？"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>

      <label className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
        <span className="shrink-0 text-text-muted">事类</span>
        <select
          value={chapter}
          onChange={(e) => {
            setChapter(e.target.value)
            setVisible(pageSize)
          }}
          className="bg-transparent outline-none"
        >
          <option value="">全部</option>
          {rules &&
            listChapters(rules).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
        </select>
        <span className="shrink-0 text-text-muted">用神</span>
        <select
          value={relative}
          onChange={(e) => {
            setRelative(e.target.value as SixRelative | '')
            setVisible(pageSize)
          }}
          className="bg-transparent outline-none"
        >
          <option value="">按事类自动</option>
          {sixRelatives.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-text-muted">
          {rulesFailed ? '条文库载入失败' : rules ? `命中 ${matches.length} 条` : '正在载入条文库…'}
        </span>
      </label>

      {evidence && <YongshenPanel evidence={evidence} />}
      <ChartTagList tags={tags} />

      {rules && <RuleMatches matches={shown} tags={tags} />}
      {matches.length > shown.length && (
        <Button variant="outline" onClick={() => setVisible(visible + pageSize)}>
          再显示 {Math.min(pageSize, matches.length - shown.length)} 条
        </Button>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm text-text-muted">
          相似书例
          {casesFailed ? '（书例库载入失败）' : cases ? '' : '（正在载入书例库…）'}
        </span>
        {cases && <CaseMatches matches={caseMatches} tags={tags} />}
      </div>

      {(applicable.length > 0 || tagRecords.length > 0) && (
        <p className="text-xs text-text-muted">
          已并入本机战绩：
          {applicable.length > 0 ? `复盘修正 ${applicable.length} 条` : ''}
          {applicable.length > 0 && tagRecords.length > 0 ? '、' : ''}
          {tagRecords.length > 0 ? `${tagRecords.length} 个卦象的应验记录` : ''}
          （去「历史」页可以关掉或删掉）
        </p>
      )}

      <AIReadingPanel prompt={prompt} />
      <PromptPreview prompt={prompt} />
    </div>
  )
}
