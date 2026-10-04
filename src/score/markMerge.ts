import type { BuiltPath, RehearsalMark, StoredProject } from './types'

export type MarkMergeStatus = 'added' | 'duplicate' | 'conflict'
export type ConflictResolution = 'current' | 'imported'
export type ConflictChoices = Record<string, ConflictResolution | undefined>

export interface MarkMergeItem {
  id: string
  status: MarkMergeStatus
  current: RehearsalMark | null
  imported: RehearsalMark | null
}

export interface MarkMergePreview {
  importedProjectName: string
  items: MarkMergeItem[]
}

export class ProjectXmlMismatchError extends Error {
  constructor() {
    super('导入工程包的原始 MusicXML 与当前工程不同，不能覆盖或合并当前工程。')
    this.name = 'ProjectXmlMismatchError'
  }
}

export function assertSameOriginalXml(current: StoredProject, imported: StoredProject): void {
  if (current.originalXml !== imported.originalXml) {
    throw new ProjectXmlMismatchError()
  }
}

function occurrenceValue(mark: RehearsalMark): number {
  return mark.occurrence ?? 1
}

function isSameMarkContent(current: RehearsalMark, imported: RehearsalMark): boolean {
  return current.measureIndex === imported.measureIndex
    && occurrenceValue(current) === occurrenceValue(imported)
    && current.label === imported.label
    && current.comment === imported.comment
    && current.color === imported.color
    && current.createdAt === imported.createdAt
}

export function assertMarksOnPath(marks: RehearsalMark[], path: BuiltPath): void {
  const arrivals = new Map(path.arrivals.map((arrival) => [
    arrival.measureIndex,
    new Set(arrival.occurrences),
  ]))

  for (const [index, mark] of marks.entries()) {
    const occurrences = arrivals.get(mark.measureIndex)
    if (!occurrences || !occurrences.has(mark.occurrence ?? 1)) {
      throw new Error(`第 ${index + 1} 个排练标记指向当前演奏路径中不存在的到达位置。`)
    }
  }
}

export function createMarkMergePreview(
  currentProject: StoredProject,
  importedProject: StoredProject,
): MarkMergePreview {
  const currentById = new Map(currentProject.marks.map((mark) => [mark.id, mark]))
  const uniqueImportedMarks: RehearsalMark[] = []
  const seenImportedIds = new Set<string>()
  for (const mark of importedProject.marks) {
    if (seenImportedIds.has(mark.id)) continue
    seenImportedIds.add(mark.id)
    uniqueImportedMarks.push(mark)
  }
  const items: MarkMergeItem[] = []

  for (const imported of uniqueImportedMarks) {
    const current = currentById.get(imported.id) ?? null
    const status: MarkMergeStatus = !current
      ? 'added'
      : isSameMarkContent(current, imported)
        ? 'duplicate'
        : 'conflict'

    items.push({ id: imported.id, status, current, imported })
  }

  items.sort((left, right) => {
    const leftMark = left.imported ?? left.current
    const rightMark = right.imported ?? right.current
    if (!leftMark || !rightMark) return 0
    if (leftMark.measureIndex !== rightMark.measureIndex) return leftMark.measureIndex - rightMark.measureIndex
    return occurrenceValue(leftMark) - occurrenceValue(rightMark)
  })

  return {
    importedProjectName: importedProject.name,
    items,
  }
}

export function unresolvedConflicts(preview: MarkMergePreview, choices: ConflictChoices): MarkMergeItem[] {
  return preview.items.filter((item) => item.status === 'conflict' && !choices[item.id])
}

export function applyMarkMerge(
  currentMarks: RehearsalMark[],
  preview: MarkMergePreview,
  choices: ConflictChoices,
): RehearsalMark[] {
  if (unresolvedConflicts(preview, choices).length > 0) {
    throw new Error('仍有同 ID 但内容不同的标记尚未选择保留版本。')
  }

  const merged = currentMarks.map((mark) => ({ ...mark }))
  const indexById = new Map(merged.map((mark, index) => [mark.id, index]))

  for (const item of preview.items) {
    if (!item.imported) continue

    if (item.status === 'added') {
      if (!indexById.has(item.imported.id)) {
        indexById.set(item.imported.id, merged.length)
        merged.push({ ...item.imported })
      }
      continue
    }

    if (item.status === 'duplicate' || choices[item.id] === 'current') continue

    const index = indexById.get(item.id)
    if (index !== undefined) merged[index] = { ...item.imported }
  }

  return merged
}
