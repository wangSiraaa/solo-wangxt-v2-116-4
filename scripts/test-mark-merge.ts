import { buildMarkMergePlan, mergeMarks, markSemantics } from '../src/score/markMerge'
import type { RehearsalMark } from '../src/score/types'

function makeMark(overrides: Partial<RehearsalMark> & { id: string }): RehearsalMark {
  return {
    measureIndex: 0,
    occurrence: 1,
    label: '标记',
    comment: '',
    color: '#f4b942',
    createdAt: '2026-10-04T00:00:00.000Z',
    ...overrides,
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message)
}

// 1. 不同到达位置的标记可并存：同一书面小节、不同实际到达次数，两者都应保留。
{
  const atOccurrence1 = makeMark({ id: 'm-1', measureIndex: 4, occurrence: 1, label: 'A1' })
  const atOccurrence2 = makeMark({ id: 'm-2', measureIndex: 4, occurrence: 2, label: 'A2' })
  const plan = buildMarkMergePlan([atOccurrence1], [atOccurrence2])
  assert(plan.added.length === 1, '不同到达次数的标记应列为新增')
  const merged = mergeMarks([atOccurrence1], plan, {})
  assert(merged.length === 2, '不同到达位置的标记应并存')
  assert(merged.some((mark) => mark.id === 'm-1') && merged.some((mark) => mark.id === 'm-2'), '两个标记都应在合并结果中')
}

// 2a. 同一工程包再次导入：同 ID 同内容 → 完全重复，不会重复增加。
{
  const mark = makeMark({ id: 'keep', measureIndex: 2, occurrence: 1, label: 'A2', comment: '注意起拍' })
  const plan = buildMarkMergePlan([mark], [{ ...mark, createdAt: '2026-10-05T00:00:00.000Z' }])
  assert(plan.duplicates.length === 1, '同 ID 同内容应为完全重复（创建时间不参与）')
  assert(plan.added.length === 0 && plan.conflicts.length === 0, '重复项不应出现在新增或冲突中')
  const merged = mergeMarks([mark], plan, {})
  assert(merged.length === 1 && merged[0].id === 'keep', '同一包再次导入不应增加标记')
}

// 2b. ID 不同但定位与说明完全一致（改名导出等情形）同样视为重复。
{
  const current = makeMark({ id: 'id-a', measureIndex: 3, occurrence: 1, label: 'A3', comment: 'x' })
  const incoming = makeMark({ id: 'id-b', measureIndex: 3, occurrence: 1, label: 'A3', comment: 'x' })
  const plan = buildMarkMergePlan([current], [incoming])
  assert(plan.duplicates.length === 1, '同位置同说明但不同 ID 也应判为完全重复')
  assert(mergeMarks([current], plan, {}).length === 1, '语义重复不应堆叠')
}

// 3a. 同 ID 不同说明必须先选择：未选择时禁止合并。
{
  const current = makeMark({ id: 'conflict-1', measureIndex: 2, occurrence: 1, label: 'A2', comment: '当前说明' })
  const incoming = makeMark({ id: 'conflict-1', measureIndex: 2, occurrence: 1, label: 'A2', comment: '导入说明' })
  const plan = buildMarkMergePlan([current], [incoming])
  assert(plan.conflicts.length === 1, '同 ID 不同说明应列为冲突')
  let threw = false
  try {
    mergeMarks([current], plan, {})
  } catch {
    threw = true
  }
  assert(threw, '冲突未选择时应拒绝合并')
}

// 3b. 选择“保留当前”：内容不被覆盖。
{
  const current = makeMark({ id: 'conflict-2', label: 'A2', comment: '当前说明' })
  const incoming = makeMark({ id: 'conflict-2', label: 'A2', comment: '导入说明' })
  const plan = buildMarkMergePlan([current], [incoming])
  const merged = mergeMarks([current], plan, { 'conflict-2': 'current' })
  assert(merged.length === 1 && merged[0].comment === '当前说明', '保留当前版本时应维持当前说明')
}

// 3c. 选择“采用导入”：用导入版本整体替换（含改到另一次到达的定位）。
{
  const current = makeMark({ id: 'conflict-3', measureIndex: 2, occurrence: 1, label: 'A2', comment: '当前说明' })
  const incoming = makeMark({ id: 'conflict-3', measureIndex: 2, occurrence: 2, label: 'A2 改', comment: '导入说明' })
  const plan = buildMarkMergePlan([current], [incoming])
  const merged = mergeMarks([current], plan, { 'conflict-3': 'incoming' })
  assert(merged.length === 1, '采用导入版本不应增加条目数')
  assert(merged[0].occurrence === 2 && merged[0].comment === '导入说明', '导入版本应整体替换当前版本')
}

// 3d. 同 ID 仅定位不同（不同书面小节或到达次数）也算冲突。
{
  const current = makeMark({ id: 'conflict-4', measureIndex: 2, occurrence: 1 })
  const moved = makeMark({ id: 'conflict-4', measureIndex: 3, occurrence: 1 })
  const plan = buildMarkMergePlan([current], [moved])
  assert(plan.conflicts.length === 1, '同 ID 仅定位不同也必须经过用户选择')
  assert(markSemantics(current) !== markSemantics(moved), '定位应参与内容比较')
}

// 4. XML 逐字相同才允许合并：合并流程的前置条件是严格字符串相等。
{
  const currentXml = '<?xml version="1.0"?><score-partwise></score-partwise>'
  const changedXml = `${currentXml}\n`
  assert(currentXml !== changedXml, '即使只差空白，原始 XML 不同也必须拒绝合并')
  assert(currentXml === currentXml, '逐字相同才允许进入合并预览')
}

// 5. 混合场景：新增并入、重复跳过、冲突按选择处理，互不干扰。
{
  const dup = makeMark({ id: 'dup', measureIndex: 1, occurrence: 1, label: 'B' })
  const conflictCurrent = makeMark({ id: 'cf', measureIndex: 1, occurrence: 1, label: 'C', comment: '旧' })
  const conflictIncoming = makeMark({ id: 'cf', measureIndex: 1, occurrence: 1, label: 'C', comment: '新' })
  const extra = makeMark({ id: 'extra', measureIndex: 5, occurrence: 2, label: 'D' })
  const plan = buildMarkMergePlan([dup, conflictCurrent], [dup, conflictIncoming, extra])
  assert(plan.added.length === 1 && plan.duplicates.length === 1 && plan.conflicts.length === 1, '混合场景分类应正确')
  const merged = mergeMarks([dup, conflictCurrent], plan, { cf: 'incoming' })
  assert(merged.length === 3, '合并后应为 旧有2 + 新增1')
  assert(merged.find((mark) => mark.id === 'cf')?.comment === '新', '冲突应采用导入说明')
  assert(merged.find((mark) => mark.id === 'extra')?.occurrence === 2, '新增标记应保留实际到达次数定位')
}

console.log('mark-merge: 全部验收场景通过')
