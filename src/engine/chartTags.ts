import { wuxing } from 'mingyu-core/wuxing'
import type { LiuyaoChart } from './liuyao'
import type { ChartEvidence } from './yongshen'

/**
 * 标签 id → 中文名。单独列出来是因为标签 id 会离开卦盘独自存活：
 * 历史记录里存的是 id，复盘统计与修正条目的触发条件也认 id，都要能回头查到名字。
 */
export const tagLabels = {
  yongshen_chishi: '持世',
  wangxiang: '旺相',
  shuairuo: '衰弱',
  shiying: '世应关系',
  xunkong: '旬空',
  yuepo: '月破',
  ripo: '日破',
  andong: '暗动',
  rumu: '入墓',
  huitou_sheng: '回头生',
  huitou_ke: '回头克',
  jinshen: '化进神',
  tuishen: '化退神',
  taisui: '临太岁',
  yuejian: '临月建',
  richen: '临日辰',
  dufa: '独发',
  liuchong: '六冲',
  liuhe: '六合',
  fanyin: '反吟',
  fuyin: '伏吟',
  sanxing: '三刑',
  sanhe_ju: '三合局',
  fushen: '伏神',
  youhun: '游魂',
  guihun: '归魂',
  yongshen_declared: '用神',
  buashanggua: '不上卦',
  liangxian: '两现',
  yuanshen: '原神',
  jishen: '忌神',
} as const

export type TagId = keyof typeof tagLabels

/**
 * 把卦盘折算成资料库同一套标签（见 SCHEMA.md「标签体系」），用于匹配断法条文。
 * 只标可由卦盘直接判定的事实；需要先定用神的标签（用神两现、原神忌神等）
 * 由 extractEvidenceTags 在用神取定之后再补。
 */
export interface ChartTag {
  id: TagId
  label: string
  /** 命中依据，直接展示给用户看，避免匹配结果像黑箱。 */
  reason: string
}

const positionLabels = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

const describe = (yao: { position: number; sixRelative: string; najiaDizhi: string; wuxing: string }) =>
  `${positionLabels[yao.position - 1]}${yao.sixRelative}${yao.najiaDizhi}${yao.wuxing}`

export function extractChartTags(liuyao: LiuyaoChart): ChartTag[] {
  const tags: ChartTag[] = []
  const add = (id: TagId, reason: string) => tags.push({ id, label: tagLabels[id], reason })

  const yaos = liuyao.yaosDetail
  const world = yaos.find((yao) => yao.isWorld)
  const response = yaos.find((yao) => yao.isResponse)
  const moving = yaos.filter((yao) => yao.isChanging)
  const branchOf = (ganzhi: string) => ganzhi.charAt(1)

  if (world) {
    add('yongshen_chishi', `${describe(world)}持世`)
    if (world.seasonState === '旺' || world.seasonState === '相') {
      add('wangxiang', `世爻${world.wuxing}当令${world.seasonState}`)
    }
    if (world.seasonState === '休' || world.seasonState === '囚' || world.seasonState === '死') {
      add('shuairuo', `世爻${world.wuxing}处${world.seasonState}地`)
    }
  }

  if (world && response) {
    const relation = wuxing.isSheng(response.wuxing, world.wuxing)
      ? '应生世'
      : wuxing.isSheng(world.wuxing, response.wuxing)
        ? '世生应'
        : wuxing.isKe(response.wuxing, world.wuxing)
          ? '应克世'
          : wuxing.isKe(world.wuxing, response.wuxing)
            ? '世克应'
            : '世应比和'
    add('shiying', relation)
  }

  const collect = (id: TagId, matched: typeof yaos, suffix: string) => {
    if (matched.length > 0) add(id, `${matched.map(describe).join('、')}${suffix}`)
  }

  collect('xunkong', yaos.filter((yao) => yao.isVoid), '旬空')
  collect('yuepo', yaos.filter((yao) => yao.isMonthBreak), '月破')
  collect('ripo', yaos.filter((yao) => yao.isDayBreak), '日破')
  collect('andong', yaos.filter((yao) => yao.isHiddenMove), '暗动')
  collect(
    'rumu',
    yaos.filter((yao) => yao.isRuMu || yao.isDongMu || yao.isHuaMu || yao.isRiMu),
    '入墓',
  )
  collect(
    'huitou_sheng',
    yaos.filter((yao) => yao.changeRelations?.includes('回头生')),
    '动化回头生',
  )
  collect(
    'huitou_ke',
    yaos.filter((yao) => yao.changeRelations?.includes('回头克')),
    '动化回头克',
  )
  collect('jinshen', yaos.filter((yao) => yao.changeDirection === '化进神'), '化进神')
  collect('tuishen', yaos.filter((yao) => yao.changeDirection === '化退神'), '化退神')
  collect(
    'taisui',
    yaos.filter((yao) => yao.najiaDizhi === branchOf(liuyao.ganzhi.year)),
    `临太岁${liuyao.ganzhi.year}`,
  )
  collect(
    'yuejian',
    yaos.filter((yao) => yao.najiaDizhi === branchOf(liuyao.ganzhi.month)),
    `临月建${liuyao.ganzhi.month}`,
  )
  collect(
    'richen',
    yaos.filter((yao) => yao.najiaDizhi === branchOf(liuyao.ganzhi.day)),
    `临日辰${liuyao.ganzhi.day}`,
  )

  if (moving.length === 1) {
    add('dufa', `${describe(moving[0])}独发`)
  }

  const chongLabels = [
    liuyao.hexagramRelations?.original === '六冲卦' && '本卦六冲',
    liuyao.hexagramRelations?.changed === '六冲卦' && '变卦六冲',
  ].filter(Boolean)
  if (chongLabels.length > 0) add('liuchong', chongLabels.join('，'))

  const heLabels = [
    liuyao.hexagramRelations?.original === '六合卦' && '本卦六合',
    liuyao.hexagramRelations?.changed === '六合卦' && '变卦六合',
  ].filter(Boolean)
  if (heLabels.length > 0) add('liuhe', heLabels.join('，'))

  const fanyin = liuyao.fanfuRelations?.fanyin ?? []
  if (fanyin.length > 0) add('fanyin', fanyin.map((item) => item.label).join('、'))
  const fuyin = liuyao.fanfuRelations?.fuyin ?? []
  if (fuyin.length > 0) add('fuyin', fuyin.map((item) => item.label).join('、'))

  const sanxing = liuyao.sanxingInYaos ?? []
  if (sanxing.length > 0) {
    add('sanxing', sanxing.map((item) => `${item.branches.join('')}${item.type}`).join('、'))
  }

  const sanhe = [liuyao.sanheWithDay, liuyao.sanheWithMonth].filter((item) => item != null)
  if (sanhe.length > 0) add('sanhe_ju', sanhe.map((item) => item.description).join('；'))

  const hidden = liuyao.hiddenSpirits ?? []
  if (hidden.length > 0) {
    add(
      'fushen',
      hidden
        .map(
          (spirit) =>
            `${spirit.sixRelative}${spirit.najiaDizhi}${spirit.wuxing}伏于${positionLabels[spirit.underYao.position - 1]}下`,
        )
        .join('、'),
    )
  }

  if (liuyao.palaceStage === '游魂') add('youhun', '本卦为游魂卦')
  if (liuyao.palaceStage === '归魂') add('guihun', '本卦为归魂卦')

  return tags
}

/** 取定用神之后才谈得上的标签：用神已定、两现、不上卦、原神忌神到位与否。 */
export function extractEvidenceTags(evidence: ChartEvidence): ChartTag[] {
  const tags: ChartTag[] = []
  const add = (id: TagId, reason: string) => tags.push({ id, label: tagLabels[id], reason })
  const candidate = evidence.selectedCandidate
  if (!candidate) return tags

  const relative = candidate.relative
  const refs = candidate.references
  add('yongshen_declared', `${candidate.label}${relative ? `（${relative}）` : ''}`)

  if (relative && refs.length === 0) {
    add('buashanggua', `用神${relative}不上卦`)
  }
  if (refs.length > 1) {
    add(
      'liangxian',
      `用神两现：${refs.map((ref) => `${positionLabels[ref.position - 1]}${ref.branch}${ref.wuxing}`).join('、')}`,
    )
  }

  for (const item of evidence.godChain) {
    if (item.status !== '盘中有对应') continue
    if (item.role === '原神') add('yuanshen', `原神${item.wuxing}（${item.relation}）在卦`)
    if (item.role === '忌神') add('jishen', `忌神${item.wuxing}（${item.relation}）在卦`)
  }

  return tags
}
