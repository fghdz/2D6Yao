import Dexie, { type EntityTable } from 'dexie'
import type { Lesson, ReadingRecord } from '@/engine/review'
import type { BenchmarkRun } from '@/engine/benchmark'

export interface SavedReading extends ReadingRecord {
  createdAt: number
}

export function readingTitle(reading: SavedReading): string {
  return reading.question || reading.label || reading.chart.liuyao.originalName
}

export const db = new Dexie('liuyao') as Dexie & {
  readings: EntityTable<SavedReading, 'id'>
  lessons: EntityTable<Lesson, 'id'>
  runs: EntityTable<BenchmarkRun, 'id'>
}

db.version(1).stores({
  readings: '++id, createdAt',
})

// 复盘修正独立成表：它由历史记录反推而来，删一条历史不该连带删掉已经学到的东西。
db.version(2).stores({
  readings: '++id, createdAt',
  lessons: '++id, createdAt',
})

// 回测记录独立成表：每跑一次存一份，换模型、改规则前后可以并排比。
db.version(3).stores({
  readings: '++id, createdAt',
  lessons: '++id, createdAt',
  runs: '++id, startedAt',
})
