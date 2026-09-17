import {
  outcomeLabels,
  promptTagRecordMinSample,
  statusOrder,
  type TagRecord,
} from '@/engine/review'
import { statusColors } from '@/lib/statusColors'

const shown = 8

/**
 * 按卦象标签摊开应验记录：哪一类盘上自己反复失手。
 * 排序用未应验率的 Wilson 下界，所以「只占过一卦且错了」不会霸占榜首。
 */
export function TagReliability({ records }: { records: readonly TagRecord[] }) {
  // Wilson 下界已经压过小样本，但「1 卦全错」仍会略高于「5 卦一半错」。
  // 统计上不算错，看着却像噪音顶掉了真信号，所以按并入提示词的同一道门槛先分两拨。
  const rows = [...records]
    .sort(
      (a, b) =>
        Number(b.total >= promptTagRecordMinSample) - Number(a.total >= promptTagRecordMinSample),
    )
    .slice(0, shown)
  if (rows.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm text-text-muted">分卦象看应验</span>
        <span className="text-xs text-text-muted">失手最多的排在前面</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((record) => (
          <div key={record.tagId} className="flex items-center gap-2 text-sm">
            <span className="w-16 shrink-0 truncate" title={record.label}>
              {record.label}
            </span>

            {/* 占比条只是辅助，右侧照常用文字把数值说清楚。 */}
            <span className="flex h-2 min-w-0 flex-1 gap-[2px]">
              {statusOrder.map((status) =>
                record.counts[status] > 0 ? (
                  <span
                    key={status}
                    title={`${outcomeLabels[status]} ${record.counts[status]} 卦`}
                    style={{
                      width: `${(record.counts[status] / record.total) * 100}%`,
                      backgroundColor: statusColors[status],
                    }}
                    className="first:rounded-l-[3px] last:rounded-r-[3px]"
                  />
                ) : null,
              )}
            </span>

            <span className="shrink-0 tabular-nums">{Math.round(record.hitRate * 100)}%</span>
            <span className="w-20 shrink-0 text-right text-xs text-text-muted">
              {record.total} 卦
              {record.total < promptTagRecordMinSample ? '·样本少' : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
