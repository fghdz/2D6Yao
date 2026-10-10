import { analyzeLiuyaoEvidence } from 'mingyu-core/divination/liuyao'
import type { LiuyaoChart } from './liuyao'
import { findQuestionType, type SixRelative } from './questionType'

export type ChartEvidence = ReturnType<typeof analyzeLiuyaoEvidence>

export { sixRelatives, type SixRelative } from './questionType'

export interface EvidenceOptions {
  /** 事类名（见 questionType.ts），用于挑取用主题与默认用神。 */
  chapter?: string
  /** 明确的用神六亲（用户手选，或按事类、物件推出），优先于主题默认。 */
  relative?: SixRelative
}

/**
 * 按事类（或指定的六亲）取用神，返回用神候选、原神忌神仇神与逐爻支持/反证。
 * 财运、感情、事业交给 mingyu-core 按主题取用；其余直接指定六亲；
 * 都没有的（出行、竞争、终身）留给通用主轴（世爻）。
 */
export function analyzeEvidence(liuyao: LiuyaoChart, options: EvidenceOptions = {}): ChartEvidence {
  const type = findQuestionType(options.chapter)
  const relative = options.relative ?? type?.relative
  return analyzeLiuyaoEvidence(liuyao, {
    topic: type?.topic ?? 'general',
    ...(relative ? { usefulGodRelative: relative } : {}),
  })
}
