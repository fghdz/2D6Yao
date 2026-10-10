import { wuxing } from 'mingyu-core/wuxing'
import type { LiuyaoChart } from './liuyao'

/**
 * 旬空、月破、伏藏、入墓的真假判定。
 *
 * 为什么单独做这一层：回填数据里，AI 以空破伏墓为主要断据的卦只对了约四成，
 * 其余的卦对了七成多。失手几乎都是同一个毛病 —— 见空就断「无」、见伏就断「不成」，
 * 而实际应事之日恰恰是那个爻出空、填实、冲开的日子。
 * 《增删卜易》讲得很清楚：旺不为空、动不为空、有生扶不为空；这类「假空」只是时候未到，
 * 该拿来推应期，不该拿来断成败。所以真假由引擎按固定规则判，不让模型每卦临场发挥。
 */

export type LatentKind = '旬空' | '月破' | '伏藏' | '入墓'

export interface LatentState {
  kind: LatentKind
  position: number
  /** 如「二爻妻财丑土」；伏神写作「妻财午火（伏于三爻下）」。 */
  subject: string
  /** true = 真空/真破/伏而难出/衰而入墓，才主落空难成。 */
  real: boolean
  /** 「假空」「真破」之类的结论名。 */
  verdict: string
  reasons: string[]
  /** 应事之期的提示：填实、冲空、出旬、冲墓等。 */
  timing: string[]
}

const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
const positionLabels = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

const clashOf = (branch: string) => branches[(branches.indexOf(branch) + 6) % 12]

const sixHe: Record<string, string> = {
  子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯',
  辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午',
}

/** 水土墓辰、木墓未、火墓戌、金墓丑。 */
const tombOf: Record<string, string> = { 水: '辰', 土: '辰', 木: '未', 火: '戌', 金: '丑' }

const verdictNames: Record<LatentKind, [real: string, apparent: string]> = {
  旬空: ['真空', '假空'],
  月破: ['真破', '假破'],
  伏藏: ['伏而难出', '伏而可出'],
  入墓: ['衰而入墓', '旺而暂收'],
}

export function analyzeLatent(liuyao: LiuyaoChart): LatentState[] {
  const yaos = liuyao.yaosDetail
  const monthBranch = liuyao.ganzhi.month.charAt(1)
  const dayBranch = liuyao.ganzhi.day.charAt(1)
  const dayWuxing = wuxing.getBranchWuxing(dayBranch)
  const moving = yaos.filter((yao) => yao.isChanging)
  const states: LatentState[] = []

  /** 日辰与动爻的生扶：有了它，空破伏墓都不算死局。 */
  const outsideSupport = (branch: string, element: string, position: number | null) => {
    const reasons: string[] = []
    if (branch === dayBranch) reasons.push('临日辰')
    else if (wuxing.isSheng(dayWuxing, element)) reasons.push('得日辰生')
    for (const yao of moving) {
      if (yao.position === position) continue
      // 动而化回头克，自身受伤，生不了别人。
      if (yao.changeRelations?.includes('回头克')) continue
      if (wuxing.isSheng(yao.wuxing, element)) {
        reasons.push(`得${positionLabels[yao.position - 1]}动爻${yao.najiaDizhi}${yao.wuxing}生`)
      }
    }
    return reasons
  }

  const seasonSupport = (element: string) => {
    const state = wuxing.getSeasonState(element, monthBranch)
    return state === '旺' || state === '相' ? [`${state}于月令`] : []
  }

  const push = (state: Omit<LatentState, 'verdict'>) =>
    states.push({ ...state, verdict: verdictNames[state.kind][state.real ? 0 : 1] })

  for (const yao of yaos) {
    const subject = `${positionLabels[yao.position - 1]}${yao.sixRelative}${yao.najiaDizhi}${yao.wuxing}`
    const branch = yao.najiaDizhi
    const support = outsideSupport(branch, yao.wuxing, yao.position)
    const season = seasonSupport(yao.wuxing)
    const huitouSheng = yao.changeRelations?.includes('回头生') ? ['化回头生'] : []

    if (yao.isVoid) {
      const reasons = [
        ...(yao.isChanging ? ['动不为空'] : []),
        ...season,
        ...support,
        ...huitouSheng,
        // 旺相之空逢日冲为「冲起」；休囚静爻逢日冲是日破，不算冲实。
        ...(dayBranch === clashOf(branch) && !yao.isDayBreak ? ['日辰冲空，冲空则实'] : []),
      ]
      // 空又逢月破或日破、安静不动、且无日辰动爻生扶，才是彻底的真空；有生扶仍算假空。
      const brokenToo =
        (yao.isMonthBreak || Boolean(yao.isDayBreak)) &&
        !yao.isChanging &&
        support.length === 0 &&
        huitouSheng.length === 0
      push({
        kind: '旬空',
        position: yao.position,
        subject,
        real: brokenToo || reasons.length === 0,
        reasons: brokenToo
          ? [yao.isMonthBreak ? '空又月破，静而无救' : '空又日破，静而无救']
          : reasons.length > 0
            ? reasons
            : ['休囚安静，无日月动爻生扶'],
        timing: [`${branch}日填实`, `${clashOf(branch)}日冲空`, '出旬之后'],
      })
    }

    if (yao.isMonthBreak) {
      const reasons = [...(yao.isChanging ? ['动而逢破，出月可用'] : []), ...support, ...huitouSheng]
      push({
        kind: '月破',
        position: yao.position,
        subject,
        real: reasons.length === 0,
        reasons: reasons.length > 0 ? reasons : ['静而受月冲，无日辰动爻生扶'],
        timing: ['出月之后', `${branch}日填实`, `${sixHe[branch]}日合破`],
      })
    }

    if (yao.isRuMu || yao.isDongMu || yao.isHuaMu || yao.isRiMu) {
      const reasons = [...season, ...support, ...huitouSheng]
      const tomb = tombOf[yao.wuxing]
      push({
        kind: '入墓',
        position: yao.position,
        subject,
        real: reasons.length === 0,
        reasons: reasons.length > 0 ? reasons : ['休囚入墓，无生扶'],
        timing: tomb ? [`${clashOf(tomb)}日冲墓`] : [],
      })
    }
  }

  for (const spirit of liuyao.hiddenSpirits ?? []) {
    const fly = yaos.find((yao) => yao.position === spirit.underYao.position)
    const subject = `${spirit.sixRelative}${spirit.najiaDizhi}${spirit.wuxing}（伏于${positionLabels[spirit.underYao.position - 1]}${spirit.underYao.sixRelative}${spirit.underYao.najiaDizhi}${spirit.underYao.wuxing}下）`
    const reasons = [
      ...seasonSupport(spirit.wuxing),
      ...outsideSupport(spirit.najiaDizhi, spirit.wuxing, null),
      ...(wuxing.isSheng(spirit.underYao.wuxing, spirit.wuxing) ? ['飞来生伏'] : []),
      ...(fly && (fly.isVoid || fly.isMonthBreak || fly.isDayBreak) ? ['飞神空破，伏神易出'] : []),
    ]
    const suppressed = wuxing.isKe(spirit.underYao.wuxing, spirit.wuxing)
    push({
      kind: '伏藏',
      position: spirit.underYao.position,
      subject,
      real: reasons.length === 0,
      reasons: [
        ...(reasons.length > 0 ? reasons : ['伏神休囚，无生扶']),
        ...(suppressed ? ['飞神克伏'] : []),
        ...(spirit.interactionEffect ? [spirit.interactionEffect] : []),
      ],
      timing: [`${clashOf(spirit.underYao.najiaDizhi)}日冲开飞神`, `${spirit.najiaDizhi}日伏神值日`],
    })
  }

  return states.sort((a, b) => a.position - b.position)
}
