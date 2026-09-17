import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Lesson } from '@/engine/review'

export function useLessons() {
  const lessons = useLiveQuery(() => db.lessons.orderBy('createdAt').reverse().toArray(), [])
  return lessons ?? []
}

/**
 * 存入新修正，跳过已有的。
 * 复盘拿的是同一批失手记录，再跑一次多半会总结出同样几条 —— 不去重就会越攒越多，
 * 同一条提醒在提示词里出现三遍，看着像三份证据。
 */
export async function addLessons(
  lessons: ReadonlyArray<Omit<Lesson, 'id'>>,
): Promise<number> {
  if (lessons.length === 0) return 0
  const key = (text: string) => text.replace(/\s+/g, '')
  const existing = new Set((await db.lessons.toArray()).map((lesson) => key(lesson.correction)))
  const fresh = lessons.filter((lesson) => !existing.has(key(lesson.correction)))
  if (fresh.length > 0) await db.lessons.bulkAdd(fresh as Lesson[])
  return fresh.length
}

export async function setLessonEnabled(id: number, enabled: boolean): Promise<void> {
  await db.lessons.update(id, { enabled })
}

export async function removeLesson(id: number): Promise<void> {
  await db.lessons.delete(id)
}
