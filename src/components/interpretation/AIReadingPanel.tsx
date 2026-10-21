import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { isConfigured } from '@/engine/aiProvider'
import { streamReading, type ChatMessage, type ReadingExchange } from '@/engine/llm'
import { useSettingsStore } from '@/store/settingsStore'
import { useChartStore } from '@/store/chartStore'
import { appVersion } from '@/lib/appVersion'
import { parseVerdict, verdictLabels } from '@/engine/verdict'

type Status = 'idle' | 'running' | 'done' | 'failed'

const starterQuestions = [
  '这一卦对我问的事，到底是吉是凶？用大白话说。',
  '用神是哪一爻？它现在是旺还是衰，为什么？',
  '如果应验，大概在什么时候？',
  '卦里有哪些对我不利的地方，需要注意什么？',
]

export function AIReadingPanel({ prompt }: { prompt: string }) {
  const ai = useSettingsStore((state) => state.ai)
  const { question, exchanges, setExchanges } = useChartStore()
  const [followUp, setFollowUp] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [openThinking, setOpenThinking] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const configured = isConfigured(ai)
  const asked = question.trim().length > 0
  const running = status === 'running'
  const started = exchanges.length > 0

  /** 还原对话历史：首轮的 user 消息是整份卦盘证据。 */
  const historyFrom = (list: ReadingExchange[]): ChatMessage[] =>
    list.flatMap((exchange) => [
      { role: 'user' as const, content: exchange.question ?? prompt },
      { role: 'assistant' as const, content: exchange.answer },
    ])

  const send = async (nextQuestion: string | null) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const previous = nextQuestion === null ? [] : exchanges
    const messages: ChatMessage[] = [
      ...historyFrom(previous),
      { role: 'user', content: nextQuestion ?? prompt },
    ]
    const index = previous.length

    setExchanges(() => [
      ...previous,
      { question: nextQuestion, thinking: '', answer: '', model: ai.model, appVersion },
    ])
    setError('')
    setStatus('running')

    const patch = (change: (exchange: ReadingExchange) => ReadingExchange) =>
      setExchanges((list) => list.map((item, i) => (i === index ? change(item) : item)))

    try {
      await streamReading(
        { config: ai, messages, signal: controller.signal },
        {
          onThinking: (delta) => patch((item) => ({ ...item, thinking: item.thinking + delta })),
          onText: (delta) => patch((item) => ({ ...item, answer: item.answer + delta })),
        },
      )
      setStatus('done')
    } catch (cause) {
      if (controller.signal.aborted) {
        setStatus('idle')
        return
      }
      setError(cause instanceof Error ? cause.message : String(cause))
      setStatus('failed')
    }
  }

  const ask = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || running) return
    setFollowUp('')
    void send(trimmed)
  }

  const hint = !configured
    ? '还没配置接口，去「设置」填地址和密钥'
    : !asked
      ? '先在上面写下要问什么，断卦要围绕所问之事'
      : ai.model

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void send(null)} disabled={!configured || !asked || running}>
          {running && !started ? '正在断卦…' : started ? '重新断卦' : 'AI 断卦'}
        </Button>
        {running && (
          <Button variant="outline" onClick={() => abortRef.current?.abort()}>
            停止
          </Button>
        )}
        <span className="text-xs text-text-muted">{hint}</span>
      </div>

      {error && <p className="text-sm text-moving">调用失败：{error}</p>}

      {exchanges.map((exchange, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          {exchange.question && (
            <p className="self-end rounded-md bg-accent/10 px-3 py-1.5 text-sm text-accent">
              {exchange.question}
            </p>
          )}
          {exchange.thinking && (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setOpenThinking(openThinking === index ? null : index)}
                className="self-start text-xs text-accent hover:underline"
              >
                {openThinking === index ? '收起推理过程' : '查看推理过程'}
              </button>
              {openThinking === index && (
                <pre className="whitespace-pre-wrap rounded-md bg-surface p-3 text-xs text-text-muted">
                  {exchange.thinking}
                </pre>
              )}
            </div>
          )}
          {exchange.answer && <div className="text-sm whitespace-pre-wrap">{exchange.answer}</div>}
          {index === 0 && exchange.answer && !(running && index === exchanges.length - 1) && (
            <VerdictLine answer={exchange.answer} />
          )}
          {running && index === exchanges.length - 1 && !exchange.answer && (
            <p className="text-sm text-text-muted">正在思考…</p>
          )}
        </div>
      ))}

      {started && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-sm text-text-muted">看不懂卦盘？接着问</span>
          <div className="flex flex-wrap gap-1.5">
            {starterQuestions.map((text) => (
              <button
                key={text}
                onClick={() => ask(text)}
                disabled={running}
                className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-surface disabled:opacity-50"
              >
                {text}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ask(followUp)
              }}
              placeholder="就这一卦继续问，例如：世爻空亡是什么意思？"
              className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-sm outline-none"
            />
            <Button onClick={() => ask(followUp)} disabled={running || !followUp.trim()}>
              发送
            </Button>
          </div>
          <p className="text-xs text-text-muted">断语要留存的话，去「卦盘」页点「保存到历史」。</p>
        </div>
      )}
    </div>
  )
}

/** 机读结论：有它才能自动评分。模型没按要求写时提示一下，免得以为已经能自动评了。 */
function VerdictLine({ answer }: { answer: string }) {
  const verdict = parseVerdict(answer)
  return (
    <p className="text-xs text-text-muted">
      {verdict
        ? `结论：${verdictLabels[verdict]}（回填实际吉凶后会自动评分）`
        : '这段断语没有写机读结论（【断】吉/凶/难断），回填时只能手动评定；可点「重新断卦」再试。'}
    </p>
  )
}
