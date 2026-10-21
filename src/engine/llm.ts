import { normalizeBaseUrl, type AiConfig } from './aiProvider'

export const systemPrompt = [
  '你是六爻断卦助手，依《增删卜易》《卜筮正宗》一路的京房六爻法断卦。',
  '排盘事实（纳甲、六亲、世应、旺衰、旬空、月破日破、伏神、动变）由排盘引擎算出，是既定输入：一律照用，不得重算、改写或另立。',
  '你的工作是在这些事实之上推理：判用神旺衰生克，权衡命中条文之间的矛盾并说明取舍，再落到结论与应期。',
  '每条结论后标明依据：「依据 [条文编号]」「参照 [书例#编号]」或「推断」。证据不足就直说不足，不要为了完整而编。',
].join('\n')

export interface ReadingHandlers {
  onThinking: (delta: string) => void
  onText: (delta: string) => void
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** 一问一答；question 为 null 表示开头那次整卦解读。 */
export interface ReadingExchange {
  question: string | null
  thinking: string
  answer: string
  /** 哪个模型、哪一版应用断的：换模型、改规则之后才分得清是谁的功劳。 */
  model?: string
  appVersion?: string
}

export interface ReadingRequest {
  config: AiConfig
  /** 首条是卦盘证据，其后是追问与回答，供多轮问答沿用同一份卦。 */
  messages: ChatMessage[]
  /** 复盘走的是另一套角色设定，默认仍是断卦。 */
  system?: string
  signal?: AbortSignal
}

export async function streamReading(
  request: ReadingRequest,
  handlers: ReadingHandlers,
): Promise<void> {
  if (request.config.kind === 'anthropic') return streamAnthropic(request, handlers)
  return streamOpenAiCompatible(request, handlers)
}

/** Anthropic 原生接口，用官方 SDK，开自适应思考。 */
async function streamAnthropic(
  { config, messages, system, signal }: ReadingRequest,
  handlers: ReadingHandlers,
): Promise<void> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: normalizeBaseUrl(config.baseUrl) || undefined,
    dangerouslyAllowBrowser: true,
  })

  const stream = client.messages.stream(
    {
      model: config.model,
      max_tokens: 32000,
      thinking: { type: 'adaptive', display: 'summarized' },
      system: system ?? systemPrompt,
      messages,
    },
    { signal },
  )

  for await (const event of stream) {
    if (event.type !== 'content_block_delta') continue
    if (event.delta.type === 'thinking_delta') handlers.onThinking(event.delta.thinking)
    if (event.delta.type === 'text_delta') handlers.onText(event.delta.text)
  }
  await stream.finalMessage()
}

interface OpenAiDelta {
  content?: string | null
  /** DeepSeek R1 与 OpenRouter 用不同字段回推理过程。 */
  reasoning_content?: string | null
  reasoning?: string | null
}

/** OpenAI 兼容接口：POST {base}/chat/completions，手工解 SSE。 */
async function streamOpenAiCompatible(
  { config, messages, system, signal }: ReadingRequest,
  handlers: ReadingHandlers,
): Promise<void> {
  const base = normalizeBaseUrl(config.baseUrl)
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      messages: [{ role: 'system', content: system ?? systemPrompt }, ...messages],
    }),
  })

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '')
    throw new Error(
      `${response.status} ${response.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`,
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 以空行分事件；最后一段可能不完整，留在 buffer 里等下一块。
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue

        let parsed: { choices?: Array<{ delta?: OpenAiDelta }>; error?: { message?: string } }
        try {
          parsed = JSON.parse(payload)
        } catch {
          continue
        }
        if (parsed.error?.message) throw new Error(parsed.error.message)

        const delta = parsed.choices?.[0]?.delta
        if (!delta) continue
        const reasoning = delta.reasoning_content ?? delta.reasoning
        if (reasoning) handlers.onThinking(reasoning)
        if (delta.content) handlers.onText(delta.content)
      }
    }
  }
}
