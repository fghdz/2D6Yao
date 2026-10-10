import { hasChangedHexagram } from './liuyao'
import type { ChartData } from './types'
import type { ChartTag } from './chartTags'
import type { CaseMatch, RuleMatch } from './corpus'
import type { Lesson, TagRecord } from './review'
import { errorKindLabels, outcomeLabels, statusOrder } from './review'
import type { ChartEvidence } from './yongshen'
import type { LatentState } from './latent'

const positionLabels = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

export interface PromptContext {
  questionType?: string
  question?: string
  evidence?: ChartEvidence
  tags?: readonly ChartTag[]
  matches?: readonly RuleMatch[]
  cases?: readonly CaseMatch[]
  /** 旬空、月破、伏藏、入墓的真假判定。 */
  latent?: readonly LatentState[]
  /** 本机复盘反推出来的修正，只传和本卦相关的那几条。 */
  lessons?: readonly Lesson[]
  /** 本机在本卦这些标签上的历史应验记录。 */
  tagRecords?: readonly TagRecord[]
}

/** 把卦盘整理成结构化文本，供复制给 LLM 或人工断卦参考。 */
export function buildChartPrompt(chart: ChartData, context: PromptContext = {}): string {
  const { liuyao, shensha } = chart
  const lines: string[] = []

  if (context.question) lines.push(`问事：${context.question}`)
  if (context.questionType) lines.push(`事类：${context.questionType}`)
  lines.push(`本卦：${liuyao.originalName}（${liuyao.palace.name}宫）`)
  lines.push(hasChangedHexagram(liuyao) ? `变卦：${liuyao.changedName}` : '变卦：无（静卦）')
  lines.push(
    `四柱：${liuyao.ganzhi.year} ${liuyao.ganzhi.month} ${liuyao.ganzhi.day} ${liuyao.ganzhi.hour}`,
  )
  if (liuyao.voidBranches.length > 0) lines.push(`旬空：${liuyao.voidBranches.join('')}`)
  if (shensha.length > 0) {
    lines.push(`神煞：${shensha.map((s) => s.name).join('、')}`)
  }

  lines.push('', '逐爻：')
  for (const yao of [...liuyao.yaosDetail].reverse()) {
    const marks = [
      yao.isWorld && '世',
      yao.isResponse && '应',
      yao.isChanging && '动',
      yao.isVoid && '空',
      yao.isDayBreak && '日破',
      yao.isMonthBreak && '月破',
      yao.isHiddenMove && '暗动',
    ].filter(Boolean)
    let line = `${positionLabels[yao.position - 1]} ${yao.yaoType} ${yao.najiaDizhi}${yao.wuxing} ${yao.sixRelative} ${yao.sixGod}`
    if (marks.length > 0) line += `（${marks.join('、')}）`
    if (yao.changedYao) {
      line += ` → 变 ${yao.changedYao.dizhi}${yao.changedYao.wuxing} ${yao.changedYao.liuqin}`
    }
    lines.push(line)
  }

  if (liuyao.specialAdvice) lines.push('', liuyao.specialAdvice)

  const candidate = context.evidence?.selectedCandidate
  if (context.evidence && candidate) {
    lines.push(
      '',
      `用神：${candidate.label}${candidate.relative ? `（${candidate.relative}）` : ''} · ${candidate.sourceStatus}`,
    )
    for (const ref of candidate.references) {
      const marks = [
        ref.isWorld && '世',
        ref.isResponse && '应',
        ref.isChanging && '动',
        ref.isVoid && '空',
        ref.source === '伏神' && '伏',
      ].filter(Boolean)
      let line = `${positionLabels[ref.position - 1]} ${ref.sixRelative}${ref.branch}${ref.wuxing}`
      if (marks.length > 0) line += `（${marks.join('、')}）`
      if (ref.support.length > 0) line += ` 支持：${ref.support.join('、')}`
      if (ref.constraints.length > 0) line += ` 反证：${ref.constraints.join('、')}`
      lines.push(line)
    }
    if (candidate.references.length === 0) lines.push('用神不上卦。')
    for (const item of context.evidence.godChain) {
      if (item.role === '用神') continue
      const where =
        item.references.length > 0
          ? `：${item.references.map((ref) => positionLabels[ref.position - 1]).join('、')}`
          : ''
      lines.push(`${item.role} ${item.wuxing}（${item.relation}）${item.status}${where}`)
    }
  }

  const latent = context.latent ?? []
  if (latent.length > 0) {
    lines.push('', '空破伏墓真假（引擎按《增删卜易》旺动生扶之法判定）：')
    for (const item of latent) {
      lines.push(
        `${item.subject} ${item.kind} → ${item.verdict}（${item.reasons.join('；')}）` +
          (item.timing.length > 0 ? ` 应期：${item.timing.join('、')}` : ''),
      )
    }
  }

  if (context.tags && context.tags.length > 0) {
    lines.push('', '卦象标签：')
    for (const tag of context.tags) lines.push(`${tag.label}：${tag.reason}`)
  }

  if (context.matches && context.matches.length > 0) {
    lines.push('', '命中条文（《六爻800例》）：')
    for (const match of context.matches) {
      lines.push(`[${match.rule.id}]（${match.rule.chapter_name}）${match.rule.text}`)
    }
  }

  if (context.cases && context.cases.length > 0) {
    lines.push('', '相似书例（《六爻800例》）：')
    for (const { entry, sameHexagram } of context.cases) {
      const gua = entry.gua
        ? `${entry.gua.ben}${entry.gua.bian ? `→${entry.gua.bian}` : ''}${sameHexagram ? '（与本卦同）' : ''}`
        : '卦盘未识别'
      lines.push(
        `[书例#${entry.seq}]（${entry.chapter_name}·${gua}）问：${entry.question_raw}`,
        `断：${truncate(entry.analysis, 800)}`,
      )
      if (entry.note) lines.push(`注释：${entry.note}`)
      for (const item of entry.yingqi) lines.push(`应期 ${item.ganzhi}：${item.text}`)
    }
  }

  const lessons = context.lessons ?? []
  if (lessons.length > 0) {
    lines.push(
      '',
      '本机复盘修正（由用户自己回填的实际结果反推，不是书中条文，样本少、可能是巧合）：',
    )
    for (const lesson of lessons) {
      const from =
        lesson.fromReadingIds.length > 0 ? `，依据本机记录 #${lesson.fromReadingIds.join(' #')}` : ''
      lines.push(
        `[修正·${errorKindLabels[lesson.kind]}] ${lesson.title}`,
        `  触发：${lesson.trigger || '（未写）'}`,
        `  应当：${lesson.correction}${from}`,
      )
    }
  }

  const tagRecords = (context.tagRecords ?? []).filter((record) => record.total > 0)
  if (tagRecords.length > 0) {
    lines.push('', '本机历史应验记录（只列与本卦相关的标签）：')
    for (const record of tagRecords) {
      const parts = statusOrder
        .filter((status) => record.counts[status] > 0)
        .map((status) => `${outcomeLabels[status]} ${record.counts[status]}`)
      lines.push(`${record.label}：回填 ${record.total} 卦（${parts.join(' · ')}）`)
    }
  }

  lines.push(
    '',
    buildInstruction({
      hasLatent: latent.length > 0,
      hasLocalRecord: lessons.length > 0 || tagRecords.length > 0,
    }),
  )

  return lines.join('\n')
}

/** 极少数书例正文长达数千字，截断以免一条书例挤掉其它证据。 */
function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}……（余文从略）`
}

/** 与 SCHEMA.md 的分工一致：盘面事实既定，推理归 LLM，但每步要带依据。 */
function buildInstruction({
  hasLatent,
  hasLocalRecord,
}: {
  hasLatent: boolean
  hasLocalRecord: boolean
}): string {
  const lines = [
    '以上盘面事实由排盘引擎算出，是既定输入：纳甲、六亲、世应、旺衰、旬空、月破日破、伏神、动变一律照用，不要重算或改写。',
    '请在此基础上推理：先判用神旺衰与生克关系，再权衡命中条文（条文之间可能互相矛盾，需说明为何取此舍彼），然后给出结论与应期。',
    '每条结论标明依据：「依据 [条文编号]」「参照 [书例#编号]」或「推断」；证据不足处直说不足，不要凑。',
  ]
  if (hasLatent) {
    // 回填数据里最常见的失手：见空断无、见伏断不成，而应事之日恰是那一爻出空填实之日。
    lines.push(
      '旬空、月破、伏藏、入墓一律以上面的真假判定为准：判为假空、假破、伏而可出、旺而暂收的，只说明时候未到，只能用来推应期，不得作为成败吉凶的主要依据；判为真空、真破、伏而难出、衰而入墓的，才主落空难成。',
      '忌神、仇神同样适用：发动之爻逢空不为空，出空即发作，不能因为它旬空、入墓就当它无力。',
    )
  }
  if (hasLocalRecord) {
    // 本机记录只有几十卦，统计上说明不了什么；给它高于书中条文的分量会越用越偏。
    lines.push(
      '本机复盘修正与应验记录来自用户自己回填的少量样本，只作提醒，权重低于书中条文：与条文冲突时以条文为准，但要明说冲突在哪、为何仍取条文。',
      '用到修正时标明「参照 [本机修正]」；样本少于 5 卦的应验记录不足以支撑结论，不要当依据用。',
    )
  }
  return lines.join('\n')
}
