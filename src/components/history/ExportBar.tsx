import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { db, type SavedReading } from '@/db/db'
import { buildReadingsExport, exportFileName } from '@/engine/exportReadings'
import { canShareFile, downloadFile, shareFile } from '@/lib/saveFile'
import { scoreReading } from '@/engine/review'

type Action = 'download' | 'share' | 'copy'

/** 现做现导：直接读库，不依赖页面上已经渲染出来的那份，导出的一定是全量。 */
async function buildFile(): Promise<{ file: File; text: string }> {
  const [readings, lessons, runs] = await Promise.all([
    db.readings.toArray(),
    db.lessons.toArray(),
    db.runs.toArray(),
  ])
  const text = JSON.stringify(buildReadingsExport(readings, lessons, new Date(), runs), null, 2)
  const file = new File([text], exportFileName(), { type: 'application/json' })
  return { file, text }
}

export function ExportBar({ readings }: { readings: readonly SavedReading[] }) {
  const [busy, setBusy] = useState<Action | null>(null)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  const verified = readings.filter((reading) => scoreReading(reading)).length
  // canShare 要拿一个文件才能问；用空壳问一次，只看浏览器支不支持分享 JSON 文件。
  const shareSupported = canShareFile(
    new File(['{}'], 'probe.json', { type: 'application/json' }),
  )

  const run = async (action: Action) => {
    setBusy(action)
    setMessage('')
    setFailed(false)
    try {
      const { file, text } = await buildFile()
      const size = `${Math.max(1, Math.round(file.size / 1024))} KB`
      if (action === 'download') {
        downloadFile(file)
        setMessage(`已导出 ${file.name}（${size}）`)
      } else if (action === 'share') {
        const shared = await shareFile(file)
        setMessage(shared ? `已分享 ${file.name}（${size}）` : '')
      } else {
        await navigator.clipboard.writeText(text)
        setMessage(`已复制到剪贴板（${size}），可直接粘贴进对话`)
      }
    } catch (cause) {
      setFailed(true)
      setMessage(`导出失败：${cause instanceof Error ? cause.message : String(cause)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm text-text-muted">导出记录</span>
        <span className="text-xs text-text-muted">
          共 {readings.length} 卦，已回填 {verified} 卦 · JSON，含统计、断语与复盘修正
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void run('download')} disabled={busy !== null}>
          {busy === 'download' ? '正在导出…' : '下载 JSON'}
        </Button>
        {shareSupported && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void run('share')}
            disabled={busy !== null}
          >
            分享…
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void run('copy')}
          disabled={busy !== null}
        >
          复制
        </Button>
      </div>

      {message && (
        <p className={`text-xs ${failed ? 'text-moving' : 'text-text-muted'}`}>{message}</p>
      )}
      <p className="text-xs text-text-muted">
        文件里有你的问事和回填的实际经过，但不含 API 密钥。手机上「下载」没反应的话，用「分享」存到文件或发给自己。
      </p>
    </div>
  )
}
