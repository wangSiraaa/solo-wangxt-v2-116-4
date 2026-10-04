import assert from 'node:assert/strict'
import {
  applyMarkMerge,
  assertSameOriginalXml,
  createMarkMergePreview,
  ProjectXmlMismatchError,
  type ConflictChoices,
} from '../src/score/markMerge'
import type { RehearsalMark, StoredProject } from '../src/score/types'

function mark(partial: Partial<RehearsalMark> & Pick<RehearsalMark, 'id' | 'measureIndex'>): RehearsalMark {
  return {
    occurrence: 1,
    label: '标记',
    comment: '',
    color: '#f4b942',
    createdAt: '2026-10-04T00:00:00.000Z',
    ...partial,
  }
}

function project(marks: RehearsalMark[], xml = '<score/>'): StoredProject {
  return {
    id: 'project-id',
    name: '测试工程',
    originalXml: xml,
    marks,
    updatedAt: '2026-10-04T00:00:00.000Z',
    createdAt: '2026-10-04T00:00:00.000Z',
  }
}

{
  const initialCurrent = project([
    mark({ id: 'same', measureIndex: 1, occurrence: 1, label: 'A', comment: '第一遍' }),
    mark({ id: 'other-position', measureIndex: 3, occurrence: 2, label: 'B', comment: '第二遍' }),
  ])
  const imported = project([
    mark({ id: 'same', measureIndex: 1, occurrence: 1, label: 'A', comment: '第一遍' }),
    mark({ id: 'new-position', measureIndex: 3, occurrence: 1, label: 'C', comment: '另一次到达' }),
  ])
  const firstPreview = createMarkMergePreview(initialCurrent, imported)

  assert.deepEqual(firstPreview.items.map((item) => [item.id, item.status]), [
    ['same', 'duplicate'],
    ['new-position', 'added'],
  ])

  const mergedOnce = applyMarkMerge(initialCurrent.marks, firstPreview, {})
  assert.equal(mergedOnce.length, 3)
  assert.ok(mergedOnce.some((item) => item.id === 'new-position' && item.measureIndex === 3 && item.occurrence === 1))
  assert.ok(mergedOnce.some((item) => item.id === 'other-position' && item.measureIndex === 3 && item.occurrence === 2))

  const reimportPreview = createMarkMergePreview(project(mergedOnce), imported)
  assert.deepEqual(reimportPreview.items.map((item) => item.status), ['duplicate', 'duplicate'])
  const mergedTwice = applyMarkMerge(mergedOnce, reimportPreview, {})
  assert.equal(mergedTwice.length, 3)
}

{
  const current = project([mark({ id: 'm1', measureIndex: 1, comment: '当前说明' })])
  const imported = project([mark({ id: 'm1', measureIndex: 1, comment: '导入说明' })])
  const preview = createMarkMergePreview(current, imported)

  assert.equal(preview.items[0]?.status, 'conflict')
  assert.throws(() => applyMarkMerge(current.marks, preview, {}), /尚未选择/)

  const choices: ConflictChoices = { m1: 'imported' }
  const merged = applyMarkMerge(current.marks, preview, choices)
  assert.equal(merged.find((item) => item.id === 'm1')?.comment, '导入说明')
}

{
  const current = project([], '<score-a/>')
  const imported = project([mark({ id: 'm1', measureIndex: 0 })], '<score-b/>')
  assert.throws(() => assertSameOriginalXml(current, imported), ProjectXmlMismatchError)
}

console.log('mark merge tests passed')
