import { hasChangedHexagram } from './liuyao'
import { tagLabels } from './chartTags'
import {
  countOutcomes,
  errorKindLabels,
  outcomeLabels,
  readingKind,
  readingTagIds,
  tagReliability,
} from './review'
import { questionKindLabels } from './questionType'
import type { Lesson, ReadingRecord } from './review'

/** 文件格式标识与版本：以后字段有变，拿到旧文件也能认出来是哪一版。 */
export const exportFormat = '2d6yao-readings'
export const exportVersion = 2

const positionLabels = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

type ExportableReading = ReadingRecord & { createdAt: number }

const iso = (time: number) => new Date(time).toISOString()

const labelOf = (id: string) => tagLabels[id as keyof typeof tagLabels] ?? id

/**
 * 卦盘按 SCHEMA.md「能算的不存」：四柱 + 本卦 + 动爻已足以复算整盘，
 * 另附逐爻摘要，省得读文件的人（或模型）自己再排一遍盘。
 */
function exportChart(record: ExportableReading) {
  const { liuyao, shensha } = record.chart
  const yaos = liuyao.yaosDetail
  return {
    gua: {
      ben: liuyao.originalName,
      bian: hasChangedHexagram(liuyao) ? liuyao.changedName : null,
      gong: liuyao.palace.name,
      stage: liuyao.palaceStage ?? null,
      movingLines: yaos.filter((yao) => yao.isChanging).map((yao) => yao.position),
    },
    sizhu: { ...liuyao.ganzhi },
    xunkong: [...liuyao.voidBranches],
    shensha: shensha.map((item) => item.name),
    // 初爻 → 上爻，与 gua64.json、cases.jsonl 的爻序一致。
    lines: yaos.map((yao) => ({
      position: yao.position,
      name: positionLabels[yao.position - 1],
      yinYang: yao.yaoType,
      najia: `${yao.najiaDizhi}${yao.wuxing}`,
      liuqin: yao.sixRelative,
      liushen: yao.sixGod,
      wangshuai: yao.seasonState ?? null,
      world: yao.isWorld,
      response: yao.isResponse,
      moving: yao.isChanging,
      void: yao.isVoid,
      dayBreak: Boolean(yao.isDayBreak),
      monthBreak: Boolean(yao.isMonthBreak),
      hiddenMove: Boolean(yao.isHiddenMove),
      changesTo: yao.changedYao
        ? `${yao.changedYao.dizhi}${yao.changedYao.wuxing} ${yao.changedYao.liuqin}`
        : null,
    })),
  }
}

function exportReading(record: ExportableReading) {
  const snapshot = Boolean(record.tagIds && record.tagIds.length > 0)
  return {
    id: record.id ?? null,
    savedAt: iso(record.createdAt),
    question: record.question || record.label || null,
    chapter: record.chapter || null,
    yongshen: record.yongshen ?? null,
    questionKind: readingKind(record),
    questionKindLabel: questionKindLabels[readingKind(record)],
    // manual = 用户在历史页手动改过题型；inferred = 按问题文字推断。
    questionKindSource: record.questionKind ? 'manual' : 'inferred',
    ...exportChart(record),
    tags: readingTagIds(record).map((id) => ({ id, label: labelOf(id) })),
    // 旧记录没存快照，标签是导出时按事类现算的，用神可能和当时手选的不一样。
    tagsSource: snapshot ? 'snapshot' : 'recomputed',
    ruleIds: record.ruleIds ?? [],
    // 推理过程（thinking）不导出：动辄上万字，断语本身已带依据。
    ai: (record.exchanges ?? []).map((exchange) => ({
      question: exchange.question,
      answer: exchange.answer,
    })),
    outcome: record.outcome
      ? {
          status: record.outcome.status,
          label: outcomeLabels[record.outcome.status],
          note: record.outcome.note,
          recordedAt: iso(record.outcome.recordedAt),
          // true = 之后重新断过卦，这条评定针对旧断语，不计入统计。
          stale: Boolean(record.outcome.stale),
        }
      : null,
  }
}

/** 与「历史」页同口径：应验率 = 应验 / 有效评定，部分应验不折算；重新断过的评定不计。 */
function summarize(records: readonly ExportableReading[]) {
  const binary = records.filter((record) => readingKind(record) === 'binary')
  const xiang = records.filter((record) => readingKind(record) === 'xiang')

  const chapters = new Map<string, ExportableReading[]>()
  for (const record of binary) {
    const key = record.chapter || '未分类'
    chapters.set(key, [...(chapters.get(key) ?? []), record])
  }

  const block = (group: readonly ExportableReading[]) => {
    const { counts, total, verified, pending, hitRate } = countOutcomes(group)
    return { total, verified, pending, byStatus: counts, hitRate }
  }

  return {
    all: block(records),
    byKind: { binary: block(binary), xiang: block(xiang) },
    // 以下只算是非题。
    byChapter: [...chapters].map(([chapter, group]) => ({ chapter, ...block(group) })),
    // App 里「分卦象看应验」的同一份数据；rankScore 是排序用的未应验率 Wilson 下界。
    byTag: tagReliability(binary).map((record) => ({
      tagId: record.tagId,
      label: record.label,
      total: record.total,
      byStatus: record.counts,
      hitRate: record.hitRate,
      rankScore: Number(record.missLowerBound.toFixed(4)),
    })),
  }
}

/** 整份导出：统计摘要 + 每条占卦记录 + 复盘修正。不含任何接口设置与密钥。 */
export function buildReadingsExport(
  readings: readonly ExportableReading[],
  lessons: readonly Lesson[],
  now: Date = new Date(),
) {
  const ordered = [...readings].sort((a, b) => a.createdAt - b.createdAt)
  return {
    format: exportFormat,
    version: exportVersion,
    exportedAt: now.toISOString(),
    about:
      '六爻预测 PWA 的占卦记录导出。卦盘只存四柱、本卦、动爻与逐爻摘要（可据此复算整盘）；' +
      '含问事、AI 断语与回填的实际结果；不含 API 密钥，也不含 AI 的推理过程。',
    summary: summarize(ordered),
    readings: ordered.map(exportReading),
    lessons: lessons.map((lesson) => ({
      id: lesson.id ?? null,
      createdAt: iso(lesson.createdAt),
      title: lesson.title,
      kind: lesson.kind,
      kindLabel: errorKindLabels[lesson.kind],
      trigger: lesson.trigger,
      tags: lesson.tagIds.map((id) => ({ id, label: labelOf(id) })),
      correction: lesson.correction,
      fromReadingIds: lesson.fromReadingIds,
      enabled: lesson.enabled,
    })),
  }
}

export type ReadingsExport = ReturnType<typeof buildReadingsExport>

export function exportFileName(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `liuyao-readings-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}
