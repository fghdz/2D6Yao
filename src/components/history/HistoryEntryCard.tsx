import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { readingTitle, type SavedReading } from '@/db/db'
import { hasChangedHexagram } from '@/engine/liuyao'
import { outcomeLabels, statusOrder, type OutcomeStatus } from '@/engine/review'
import { statusColors } from '@/lib/statusColors'

export function HistoryEntryCard({
  reading,
  onOpen,
  onDelete,
  onRecordOutcome,
}: {
  reading: SavedReading
  onOpen: () => void
  onDelete: () => void
  onRecordOutcome: (status: OutcomeStatus, note: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState(reading.outcome?.note ?? '')
  const { liuyao } = reading.chart
  const exchanges = reading.exchanges ?? []

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{readingTitle(reading)}</span>
          <span className="text-xs text-text-muted">
            {liuyao.originalName}
            {hasChangedHexagram(liuyao) ? ` → ${liuyao.changedName}` : '（静卦）'}
            {reading.chapter ? ` · ${reading.chapter}` : ''} ·{' '}
            {new Date(reading.createdAt).toLocaleString('zh-CN')}
          </span>
        </div>
        {reading.outcome && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: statusColors[reading.outcome.status] }}
            />
            {outcomeLabels[reading.outcome.status]}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? '收起' : exchanges.length > 0 ? `断语与复盘（${exchanges.length}）` : '复盘'}
        </Button>
        <Button variant="outline" size="sm" onClick={onOpen}>
          载入
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          删除
        </Button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {exchanges.length === 0 ? (
            <p className="text-text-muted">这一卦没有存下 AI 断语。</p>
          ) : (
            exchanges.map((exchange, index) => (
              <div key={index} className="flex flex-col gap-1">
                {exchange.question && (
                  <p className="self-end rounded-md bg-accent/10 px-3 py-1 text-xs text-accent">
                    {exchange.question}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{exchange.answer}</p>
              </div>
            ))
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="text-text-muted">实际结果</span>
            <div className="flex flex-wrap gap-1.5">
              {statusOrder.map((status) => {
                const active = reading.outcome?.status === status
                return (
                  <button
                    key={status}
                    onClick={() => onRecordOutcome(status, note)}
                    className={
                      'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ' +
                      (active ? 'border-accent bg-accent/10' : 'border-border hover:bg-surface')
                    }
                  >
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: statusColors[status] }}
                    />
                    {outcomeLabels[status]}
                  </button>
                )
              })}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() =>
                reading.outcome && onRecordOutcome(reading.outcome.status, note)
              }
              rows={2}
              placeholder="后来实际发生了什么？记下来才好回头对照。"
              className="rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none"
            />
            {reading.outcome && (
              <span className="text-xs text-text-muted">
                已于 {new Date(reading.outcome.recordedAt).toLocaleDateString('zh-CN')} 回填
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
