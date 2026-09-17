import { create } from 'zustand'
import { buildChart } from '@/engine/chartAssembler'
import type { ChartData, ChartSettings } from '@/engine/types'
import type { ReadingExchange } from '@/engine/llm'
import type { SixRelative } from '@/engine/yongshen'
import type { SavedReading } from '@/db/db'

/** 当前这一次占卜：卦盘、所问何事、AI 断语，以及它在历史里的位置。 */
interface ChartStore {
  chart: ChartData | null
  question: string
  chapter: string
  /** 手选用神；空串表示按事类自动取。放在这里是因为保存历史时也要记下当时取的用神。 */
  relative: SixRelative | ''
  exchanges: ReadingExchange[]
  /** 已存入历史的记录 id；再次保存时就地更新，不另开一条。 */
  savedId: number | null
  /** 设置 → 重新计算完整卦盘，是生成新卦盘的唯一途径。 */
  regenerate: (settings: ChartSettings) => void
  /** 载入一条历史记录，连同问事与断语，便于复盘或继续追问。 */
  loadReading: (reading: SavedReading) => void
  setQuestion: (question: string) => void
  setChapter: (chapter: string) => void
  setRelative: (relative: SixRelative | '') => void
  setExchanges: (update: (current: ReadingExchange[]) => ReadingExchange[]) => void
  setSavedId: (savedId: number | null) => void
  clear: () => void
}

export const useChartStore = create<ChartStore>((set) => ({
  chart: null,
  question: '',
  chapter: '',
  relative: '',
  exchanges: [],
  savedId: null,
  // 换了卦，旧断语与旧存档就不再对应；问事与事类留着，多半还是同一件事。
  regenerate: (settings) => set({ chart: buildChart(settings), exchanges: [], savedId: null }),
  loadReading: (reading) =>
    set({
      chart: reading.chart,
      question: reading.question ?? reading.label ?? '',
      chapter: reading.chapter ?? '',
      relative: (reading.yongshen as SixRelative | undefined) ?? '',
      exchanges: reading.exchanges ?? [],
      savedId: reading.id ?? null,
    }),
  setQuestion: (question) => set({ question }),
  setChapter: (chapter) => set({ chapter }),
  setRelative: (relative) => set({ relative }),
  setExchanges: (update) => set((state) => ({ exchanges: update(state.exchanges) })),
  setSavedId: (savedId) => set({ savedId }),
  clear: () => set({ chart: null, exchanges: [], savedId: null }),
}))
