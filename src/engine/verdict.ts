/**
 * 机读结论：断语最后一行「【断】吉 / 【断】凶 / 【断】难断」。
 * 有了它，加上回填时记下的「实际吉凶」，评分就不用人逐条判 ——
 * 上一轮回测里有一卦断「下午不能马上解决」、实际当场解决，却被记成了应验；
 * 重新断卦之后旧评定也就自动作废，不必再手动重评。
 */
export type Verdict = 'good' | 'bad' | 'unclear'

export const verdictLabels: Record<Verdict, string> = {
  good: '吉',
  bad: '凶',
  unclear: '难断',
}

export const verdictLines: Record<Verdict, string> = {
  good: '【断】吉',
  bad: '【断】凶',
  unclear: '【断】难断',
}

/** 取最后一个【断】标记；模型偶尔用「断：」或加粗，一并认。 */
export function parseVerdict(answer: string): Verdict | null {
  const matches = [...answer.matchAll(/[【[]\s*断\s*[】\]][\s*]*[:：]?[\s*]*(难断|吉|凶)/g)]
  const last = matches.at(-1)?.[1]
  if (last === '吉') return 'good'
  if (last === '凶') return 'bad'
  if (last === '难断') return 'unclear'
  return null
}
