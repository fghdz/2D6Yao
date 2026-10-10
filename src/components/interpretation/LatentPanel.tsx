import type { LatentState } from '@/engine/latent'

/**
 * 空破伏墓的真假。真假用文字写明，颜色只作辅助：
 * 真者主落空难成，假者只是时候未到、用来推应期。
 */
export function LatentPanel({ items }: { items: readonly LatentState[] }) {
  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm text-text-muted">空破伏墓</span>
        <span className="text-xs text-text-muted">
          真者主落空难成；假者只是时候未到，用来推应期
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((item, index) => (
          <div key={`${item.kind}-${item.subject}-${index}`} className="flex flex-col gap-0.5 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span>{item.subject}</span>
              <span className="text-xs text-text-muted">{item.kind}</span>
              <span
                className={
                  'rounded-full px-2 py-0.5 text-xs ' +
                  (item.real ? 'bg-moving/10 text-moving' : 'bg-accent/10 text-accent')
                }
              >
                {item.verdict}
              </span>
            </div>
            <span className="text-xs text-text-muted">{item.reasons.join('；')}</span>
            {item.timing.length > 0 && (
              <span className="text-xs text-text-muted">应期：{item.timing.join('、')}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
