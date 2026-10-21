import type { SavedReading } from '@/db/db'
import { questionKindLabels } from '@/engine/questionType'
import { countOutcomes, outcomeLabels, readingKind, scoreReading, statusOrder } from '@/engine/review'
import { statusColors } from '@/lib/statusColors'

/**
 * 应验率按题型分开算：是非题（成不成、吉不吉）是主数字；
 * 取象题（是什么、在哪、多少、何时）是另一套功夫，单列一行，不混进主数字。
 */
export function AccuracyStats({ readings }: { readings: readonly SavedReading[] }) {
  if (readings.length === 0) return null

  const binary = countOutcomes(readings.filter((reading) => readingKind(reading) === 'binary'))
  const xiang = countOutcomes(readings.filter((reading) => readingKind(reading) === 'xiang'))
  const stale = readings.filter((reading) => reading.outcome?.stale && !scoreReading(reading)).length
  const pending = binary.pending + xiang.pending

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-text-muted">{questionKindLabels.binary}应验率</span>
        {binary.hitRate !== null ? (
          <>
            <span className="text-5xl leading-none font-medium">
              {Math.round(binary.hitRate * 100)}%
            </span>
            <span className="text-sm text-text-muted">
              {binary.counts.accurate} / {binary.verified} 卦已应验
            </span>
          </>
        ) : (
          <span className="text-sm text-text-muted">还没有回填过是非题的结果</span>
        )}
      </div>

      {binary.verified > 0 && (
        // 部分到整体：三段占比条，段间留 2px 空隙，两端 4px 圆角。
        <div className="flex h-2.5 gap-[2px] overflow-hidden">
          {statusOrder.map((status) =>
            binary.counts[status] > 0 ? (
              <div
                key={status}
                title={`${outcomeLabels[status]} ${binary.counts[status]} 卦`}
                style={{
                  width: `${(binary.counts[status] / binary.verified) * 100}%`,
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
            {outcomeLabels[status]} <span className="text-text-muted">{binary.counts[status]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-text-muted">
          <span aria-hidden className="size-2.5 rounded-full border border-border" />
          待评定 {pending}
          {stale > 0 ? `（其中 ${stale} 卦重新断过）` : ''}
        </span>
      </div>

      {xiang.total > 0 && (
        <p className="border-t border-border pt-2 text-sm">
          <span className="text-text-muted">{questionKindLabels.xiang}（是什么、在哪、多少、何时）：</span>
          {xiang.verified > 0
            ? `${xiang.counts.accurate} / ${xiang.verified} 卦说中`
            : '还没有回填结果'}
          <span className="text-xs text-text-muted">，不计入上面的应验率</span>
        </p>
      )}
    </div>
  )
}
