import { useEffect, useMemo, useState } from 'react'
import { useChart } from '@/hooks/useChart'
import { promptRuleLimit, useChartEvidence } from '@/hooks/useChartEvidence'
import { useHistory } from '@/hooks/useHistory'
import { useLessons } from '@/hooks/useLessons'
import { loadCases, matchCases, type CorpusCase } from '@/engine/corpus'
import { lessonsForTags, readingKind, tagRecordsForPrompt, tagReliability } from '@/engine/review'
import { questionTypes } from '@/engine/questionType'
import { sixRelatives, type SixRelative } from '@/engine/yongshen'
import { Button } from '@/components/ui/button'
import { YongshenPanel } from './YongshenPanel'
import { ChartTagList } from './ChartTagList'
import { LatentPanel } from './LatentPanel'
import { RuleMatches } from './RuleMatches'
import { CaseMatches } from './CaseMatches'
import { PromptPreview } from './PromptPreview'
import { AIReadingPanel } from './AIReadingPanel'
import { buildChartPrompt } from '@/engine/promptBuilder'

const pageSize = promptRuleLimit
const caseCount = 3

export function InterpretationPanel() {
  const { chart, question, chapter, relative, setQuestion, setChapter, setRelative } = useChart()
  const { rules, rulesFailed, resolved, bookChapter, evidence, tags, matches, latent } =
    useChartEvidence()
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
        ? matchCases(cases, tags, chart.liuyao.originalName, bookChapter).slice(0, caseCount)
        : [],
    [cases, chart, tags, bookChapter],
  )

  // 本机战绩反馈：只把与本卦相关的那几条修正与标签记录并进提示词。
  const tagIds = useMemo(() => tags.map((tag) => tag.id), [tags])
  const applicable = useMemo(() => lessonsForTags(lessons, tagIds), [lessons, tagIds])
  // 标签战绩只看是非题：取象题的对错和卦象吉凶无关，混进来只是噪音。
  const tagRecords = useMemo(
    () =>
      tagRecordsForPrompt(
        tagReliability(readings.filter((reading) => readingKind(reading) === 'binary')),
        tagIds,
      ),
    [readings, tagIds],
  )

  if (!chart) {
    return <p className="text-sm text-text-muted">还没有卦盘，先去「起卦」生成一个。</p>
  }

  const prompt = buildChartPrompt(chart, {
    question: question.trim() || undefined,
    questionType: resolved.type
      ? `${resolved.type.name}（${resolved.typeSource === 'chosen' ? '手选' : '据问题推断'}；${resolved.type.yongshenNote}）`
      : undefined,
    evidence: evidence ?? undefined,
    latent,
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

      <div className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-text-muted">事类</span>
            <select
              value={chapter}
              onChange={(e) => {
                setChapter(e.target.value)
                setVisible(pageSize)
              }}
              className="bg-transparent outline-none"
            >
              <option value="">
                {resolved.typeSource === 'inferred' && resolved.type
                  ? `自动：${resolved.type.name}`
                  : '自动（未识别）'}
              </option>
              {questionTypes.map((type) => (
                <option key={type.name} value={type.name}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="shrink-0 text-text-muted">用神</span>
            <select
              value={relative}
              onChange={(e) => {
                setRelative(e.target.value as SixRelative | '')
                setVisible(pageSize)
              }}
              className="bg-transparent outline-none"
            >
              <option value="">
                {`按事类：${evidence?.selectedCandidate?.relative ?? '世爻'}`}
              </option>
              {sixRelatives.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto text-xs text-text-muted">
            {rulesFailed ? '条文库载入失败' : rules ? `命中 ${matches.length} 条` : '正在载入条文库…'}
          </span>
        </div>
        <p className={`text-xs ${resolved.type ? 'text-text-muted' : 'text-moving'}`}>
          {resolved.type
            ? `${resolved.typeSource === 'inferred' ? '据问题推断' : '已手选'}：${resolved.type.yongshenNote}。不对就在上面改。`
            : '没从问题里认出事类，用神只能按世爻取 —— 断卦前最好先手选事类。'}
        </p>
      </div>

      {evidence && (
        <YongshenPanel
          evidence={evidence}
          sourceLabel={
            resolved.relativeSource === 'chosen'
              ? '手选'
              : resolved.typeSource === 'inferred'
                ? '据问题推断的事类'
                : resolved.typeSource === 'chosen'
                  ? '按所选事类'
                  : undefined
          }
        />
      )}
      <LatentPanel items={latent} />
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
