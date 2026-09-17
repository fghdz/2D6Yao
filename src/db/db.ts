import Dexie, { type EntityTable } from 'dexie'
import type { Lesson, ReadingRecord } from '@/engine/review'

export interface SavedReading extends ReadingRecord {
  createdAt: number
}

export function readingTitle(reading: SavedReading): string {
  return reading.question || reading.label || reading.chart.liuyao.originalName
}

export const db = new Dexie('liuyao') as Dexie & {
  readings: EntityTable<SavedReading, 'id'>
  lessons: EntityTable<Lesson, 'id'>
}

db.version(1).stores({
  readings: '++id, createdAt',
})

// 复盘修正独立成表：它由历史记录反推而来，删一条历史不该连带删掉已经学到的东西。
db.version(2).stores({
  readings: '++id, createdAt',
  lessons: '++id, createdAt',
})
