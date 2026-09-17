import { useHistory } from '@/hooks/useHistory'
import { useChartStore } from '@/store/chartStore'
import { HistoryEntryCard } from './HistoryEntryCard'
import { AccuracyStats } from './AccuracyStats'
import { ReviewPanel } from './ReviewPanel'
import type { OutcomeStatus } from '@/engine/review'

export function HistoryList() {
  const { readings, update, remove } = useHistory()
  const loadReading = useChartStore((state) => state.loadReading)

  if (readings.length === 0) {
    return <p className="text-sm text-text-muted">还没有保存过卦盘。</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <AccuracyStats readings={readings} />
      <ReviewPanel readings={readings} />

      <div className="flex flex-col gap-2">
        {readings.map((reading) => (
          <HistoryEntryCard
            key={reading.id}
            reading={reading}
            onOpen={() => loadReading(reading)}
            onDelete={() => reading.id !== undefined && void remove(reading.id)}
            onRecordOutcome={(status: OutcomeStatus, note: string) => {
              if (reading.id === undefined) return
              void update(reading.id, { outcome: { status, note, recordedAt: Date.now() } })
            }}
          />
        ))}
      </div>
    </div>
  )
}
