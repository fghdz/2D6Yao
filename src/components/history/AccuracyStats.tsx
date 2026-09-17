import type { SavedReading } from '@/db/db'
import { outcomeLabels, statusOrder, type OutcomeStatus } from '@/engine/review'
import { statusColors } from '@/lib/statusColors'

export function AccuracyStats({ readings }: { readings: readonly SavedReading[] }) {
  const counts: Record<OutcomeStatus, number> = { accurate: 0, partial: 0, wrong: 0 }
  for (const reading of readings) {
    if (reading.outcome) counts[reading.outcome.status] += 1
  }
  const verified = counts.accurate + counts.partial + counts.wrong
  const pending = readings.length - verified

  if (readings.length === 0) return null

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-text-muted">应验率</span>
        {verified > 0 ? (
          <>
            <span className="text-5xl leading-none font-medium">
              {Math.round((counts.accurate / verified) * 100)}%
            </span>
            <span className="text-sm text-text-muted">
              {counts.accurate} / {verified} 卦已应验
            </span>
          </>
        ) : (
          <span className="text-sm text-text-muted">还没有回填过结果</span>
        )}
      </div>

      {verified > 0 && (
        // 部分到整体：三段占比条，段间留 2px 空隙，两端 4px 圆角。
        <div className="flex h-2.5 gap-[2px] overflow-hidden">
          {statusOrder.map((status) =>
            counts[status] > 0 ? (
              <div
                key={status}
                title={`${outcomeLabels[status]} ${counts[status]} 卦`}
                style={{
                  width: `${(counts[status] / verified) * 100}%`,
                  backgroundColor: statusColors[status],
                }}
                className="first:rounded-l-[4px] last:rounded-r-[4px]"
              />
            ) : null,
          )}
        </div>
      )}

      {/* 颜色之外必须有文字：色块只是辅助，数值与名称照常用文字色。 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {statusOrder.map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: statusColors[status] }}
            />
            {outcomeLabels[status]} <span className="text-text-muted">{counts[status]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-text-muted">
          <span aria-hidden className="size-2.5 rounded-full border border-border" />
          待验证 {pending}
        </span>
      </div>
    </div>
  )
}
