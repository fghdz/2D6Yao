import type { LiuyaoEvidenceTopic } from 'mingyu-core/divination/liuyao'

export const sixRelatives = ['父母', '兄弟', '子孙', '妻财', '官鬼'] as const
export type SixRelative = (typeof sixRelatives)[number]

/**
 * 事类：决定用神取哪一爻，也决定条文和书例按哪一章检索。
 *
 * 回填的 50 卦里有 49 卦没选事类，引擎于是一律以世爻当用神，给 AI 的原神忌神
 * 全是围着世爻算的；AI 自己在断语里另取用神，两边对不上。所以改成从问题里推断，
 * 推不出来再提醒手选。名字尽量沿用书中章名，书例检索就能直接按章过滤。
 */
export interface QuestionType {
  name: string
  /** 书中对应章名；没有对应章（如房产）就不按章过滤条文。 */
  bookChapter?: string
  topic: LiuyaoEvidenceTopic
  relative?: SixRelative
  /** 用神说明，显示给用户看。 */
  yongshenNote: string
  /** 关键词；命中越多越可能是这一类。 */
  patterns: ReadonlyArray<string | RegExp>
}

/**
 * 排列顺序即同分时的优先次序：越具体的事类越靠前。
 * 「老公」「公司」这类词只指人、指地方，不说明问的是哪类事，不收进关键词，
 * 否则「我老公副高能不能过」会被算成婚姻、「集团公司的考试」会被算成事业。
 */
export const questionTypes: readonly QuestionType[] = [
  {
    name: '官司·牢狱',
    bookChapter: '官司·牢狱',
    topic: 'general',
    relative: '官鬼',
    yongshenNote: '以官鬼为官非',
    patterns: ['官司', '起诉', '立案', '开庭', '判刑', '判决', '罚', '坐牢', '拘留', '仲裁', '缓刑', '律师', '被告', '原告', '违法'],
  },
  {
    name: '疾病·伤灾',
    bookChapter: '疾病·伤灾',
    topic: 'general',
    relative: '官鬼',
    yongshenNote: '以官鬼为病',
    patterns: ['病', '手术', '吐血', '癌', '疼', '痛', '症', '炎', '康复', '血压', '住院', '受伤', '车祸', '呕', '发烧', '体检'],
  },
  {
    name: '失物',
    bookChapter: '失物',
    topic: 'general',
    relative: '妻财',
    yongshenNote: '钱物以妻财为用；证件、车辆、文书取父母；宠物取子孙',
    patterns: ['丢', '找不到', '找回', '找到', '在哪', '失物', '失踪', '走失', '遗失', '被偷', '狗', '猫', '宠物'],
  },
  {
    name: '财运',
    bookChapter: '财运',
    topic: 'caifu',
    yongshenNote: '以妻财为用神',
    patterns: ['钱', '财', '欠', '还款', '还钱', '讨', '要回', '收回', '工资', '中标', '投标', '赚', '亏', '股', '彩礼', '押金', '退还', '生意', '投资', '借', '麻将', '赌', '彩票', '货款', '债'],
  },
  {
    name: '婚姻情缘',
    bookChapter: '婚姻情缘',
    topic: 'ganqing',
    yongshenNote: '男以妻财、女以官鬼为对方，兼看世应',
    patterns: ['对象', '结婚', '婚', '恋', '感情', '分手', '复合', '男朋友', '女朋友', '男友', '女友', '小三', '相亲', '网聊', '约会'],
  },
  {
    name: '官运·事业',
    bookChapter: '官运·事业',
    topic: 'shiye',
    yongshenNote: '以官鬼为工作、职位',
    patterns: ['工作', '面试', '应聘', '求职', '升职', '晋升', '提拔', '裁员', '辞职', '离职', '跳槽', '调动', '入职', '职位', '副高', '职称', '当兵', '入伍', '士官', '部队', '上班', '单位', '岗位', '编制'],
  },
  {
    name: '学历文事',
    bookChapter: '学历文事',
    topic: 'general',
    relative: '父母',
    yongshenNote: '以父母为考试、文书',
    patterns: ['考试', '考研', '录取', '考上', '保研', '学校', '大学', '证书', '执业', '考核', '笔试', '登刊', '发表', '论文', '文章', '成绩', '升学', '中考', '高考', '学位', '毕业', '资格'],
  },
  {
    name: '子女',
    bookChapter: '子女',
    topic: 'general',
    relative: '子孙',
    yongshenNote: '以子孙为子女、胎孕',
    patterns: ['怀孕', '孕', '生男', '生女', '男宝', '女宝', '孙子', '孙女', '生育', '胎', '宝宝', '分娩'],
  },
  {
    name: '房产·住宅',
    topic: 'general',
    relative: '父母',
    yongshenNote: '以父母为房屋、契约',
    patterns: ['买房', '卖房', '购房', '房价', '看房', '装修', /买.{0,20}房/, /房.{0,20}买/],
  },
  {
    name: '天气·竞争·灾害',
    bookChapter: '天气·竞争·灾害',
    topic: 'general',
    yongshenNote: '世为我方、应为对方；天气另取',
    patterns: ['比赛', '输赢', '能赢', '赢', '胜', '男足', '球', '冠军', '第一', '名次', '竞争', '天气', '下雨', '台风'],
  },
  {
    name: '出行·行人',
    bookChapter: '出行·行人',
    topic: 'general',
    yongshenNote: '自己出行看世爻；问行人以其人六亲为用',
    patterns: ['出行', '旅行', '旅游', '出门', '航班', '飞机', '路上', '行程', '行人', '归期'],
  },
  {
    name: '终身卦',
    bookChapter: '终身卦',
    topic: 'general',
    yongshenNote: '以世爻为本人',
    patterns: ['终身', '一生', '命运'],
  },
]

/** 失物按物件另取用神：证件车辆属父母，宠物属子孙。 */
const lostItemRelatives: ReadonlyArray<[RegExp, SixRelative]> = [
  [/狗|猫|宠物|鸟/, '子孙'],
  [/证|护照|文件|合同|车|书/, '父母'],
]

export function findQuestionType(name?: string): QuestionType | undefined {
  return name ? questionTypes.find((type) => type.name === name) : undefined
}

function score(question: string, type: QuestionType): number {
  return type.patterns.reduce(
    (total, pattern) =>
      total + (typeof pattern === 'string' ? Number(question.includes(pattern)) : Number(pattern.test(question))),
    0,
  )
}

/** 按关键词命中数推断事类；一个都不中返回 undefined。 */
export function inferQuestionType(question: string): QuestionType | undefined {
  let best: QuestionType | undefined
  let bestScore = 0
  for (const type of questionTypes) {
    const value = score(question, type)
    if (value > bestScore) {
      best = type
      bestScore = value
    }
  }
  return best
}

export interface ResolvedQuestion {
  type?: QuestionType
  /** 事类是用户选的，还是从问题推断的。 */
  typeSource: 'chosen' | 'inferred' | 'none'
  relative?: SixRelative
  relativeSource: 'chosen' | 'type' | 'none'
}

/** 用户手选优先；没选的从问题推断。 */
export function resolveQuestion(input: {
  question: string
  chapter?: string
  relative?: SixRelative | ''
}): ResolvedQuestion {
  const chosen = findQuestionType(input.chapter)
  const inferred = chosen ? undefined : inferQuestionType(input.question)
  const type = chosen ?? inferred
  const typeSource = chosen ? 'chosen' : inferred ? 'inferred' : 'none'

  if (input.relative) return { type, typeSource, relative: input.relative, relativeSource: 'chosen' }

  let relative = type?.relative
  if (type?.name === '失物') {
    relative = lostItemRelatives.find(([pattern]) => pattern.test(input.question))?.[1] ?? relative
  }
  return { type, typeSource, relative, relativeSource: relative ? 'type' : 'none' }
}

export type QuestionKind = 'binary' | 'xiang'

export const questionKindLabels: Record<QuestionKind, string> = {
  binary: '是非题',
  xiang: '取象题',
}

const binaryMarkers =
  /能否|是否|会不会|能不能|可否|成否|吉凶|吗|有无|有没有|是不是|如何|怎么样|怎样|顺不顺|好不好|行不行|成不成/
const xiangMarkers = /射覆|什么|啥|哪|多少|几|还是|多久|何时|方位/

/**
 * 是非题问成不成、吉不吉；取象题问是什么、在哪、多少、何时。
 * 两类是两套功夫，混在一个应验率里就看不出是非题到底准不准。
 * 一问里两者都有时（「能否找到？在哪找到？」）按是非题算，以主问为准。
 */
export function inferQuestionKind(question: string): QuestionKind {
  if (binaryMarkers.test(question)) return 'binary'
  if (xiangMarkers.test(question)) return 'xiang'
  return 'binary'
}
