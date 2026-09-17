import type { OutcomeStatus } from '@/engine/review'

/** 应验状态色（dataviz status palette），明暗两种主题下都可用。 */
export const statusColors: Record<OutcomeStatus, string> = {
  accurate: '#0ca30c',
  partial: '#fab219',
  wrong: '#d03b3b',
}
