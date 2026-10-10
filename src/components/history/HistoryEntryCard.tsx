import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { readingTitle, type SavedReading } from '@/db/db'
import { hasChangedHexagram } from '@/engine/liuyao'
import { outcomeLabels, readingKind, statusOrder, type OutcomeStatus } from '@/engine/review'
import { questionKindLabels, type QuestionKind } from '@/engine/questionType'
import { statusColors } from '@/lib/statusColors'

export function HistoryEntryCard({
  reading,
  onOpen,
  onDelete,
  onRecordOutcome,
  onSaveNote,
  onSetKind,
}: {
  reading: SavedReading
  onOpen: () => void
  onDelete: () => void
  /** 评定（会清掉「过期」标记）。 */
  onRecordOutcome: (status: OutcomeStatus, note: string) => void
  /** 只改实际经过，不动评定。 */
  onSaveNote: (note: string) => void
  onSetKind: (kind: QuestionKind) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState(reading.outcome?.note ?? '')
  const { liuyao } = reading.chart
  const exchanges = reading.exchanges ?? []
  const kind = readingKind(reading)
  const stale = Boolean(reading.outcome?.stale)

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
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
          {reading.outcome &&
            (stale ? (
              <span className="flex items-center gap-1.5 text-text-muted">
                <span aria-hidden className="size-2.5 rounded-full border border-border" />
                待重新评定
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: statusColors[reading.outcome.status] }}
                />
                {outcomeLabels[reading.outcome.status]}
              </span>
            ))}
          {/* 题型可以点着切换：推断错了（比如「什么时候还」其实是在问还不还）就改过来。 */}
          <button
            onClick={() => onSetKind(kind === 'binary' ? 'xiang' : 'binary')}
            title="点一下切换题型"
            className="rounded-full border border-border px-2 py-0.5 text-text-muted hover:bg-surface"
          >
            {questionKindLabels[kind]}
          </button>
        </div>
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
            <span className="text-text-muted">断语说中了吗</span>
            {stale && (
              <p className="text-xs text-moving">
                这一卦重新断过，原来的评定针对的是旧断语，已不计入统计。请对照新断语重新评定。
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {statusOrder.map((status) => {
                const active = !stale && reading.outcome?.status === status
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
            <p className="text-xs text-text-muted">
              只看主问题的成与不成有没有说中；一卦问了好几问、对一半错一半，才选「部分应验」。
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => reading.outcome && note !== reading.outcome.note && onSaveNote(note)}
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
