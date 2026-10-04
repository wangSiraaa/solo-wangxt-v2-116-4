import type { RehearsalMark } from './types'

/**
 * 排练标记合并：仅允许在“原始 XML 逐字相同”的工程包之间进行。
 * 因为 XML 相同，书面小节下标与实际到达次数在两边含义一致，标记位置可以直接比较。
 */

export type MarkMergeStatus = 'new' | 'duplicate' | 'conflict'
export type ConflictResolution = 'current' | 'incoming'

export interface MarkMergeEntry {
  status: MarkMergeStatus
  /** 工程包中的标记（冲突时即“导入版本”） */
  incoming: RehearsalMark
  /** 当前工程中的同 ID 标记；仅 conflict 状态存在 */
  current?: RehearsalMark
}

export interface MarkMergePlan {
  added: MarkMergeEntry[]
  duplicates: MarkMergeEntry[]
  conflicts: MarkMergeEntry[]
}

/** 判定“完全重复”时比较的内容：定位（书面小节 + 实际到达次数）与说明本身。id 与创建时间不参与。 */
export function markSemantics(mark: RehearsalMark): string {
  return JSON.stringify([
    mark.measureIndex,
    mark.occurrence ?? null,
    mark.label,
    mark.comment,
    mark.color,
  ])
}

/**
 * 生成合并预览：
 * - 同 ID 且内容完全一致 → 完全重复，不再增加；
 * - 同 ID 但定位/说明不同 → 冲突，必须由用户选择保留哪一版；
 * - 当前工程没有的 ID → 新增。
 */
export function buildMarkMergePlan(currentMarks: RehearsalMark[], incomingMarks: RehearsalMark[]): MarkMergePlan {
  const currentById = new Map(currentMarks.map((mark) => [mark.id, mark]))
  const currentSemanticKeys = new Set(currentMarks.map(markSemantics))

  const plan: MarkMergePlan = { added: [], duplicates: [], conflicts: [] }
  for (const incoming of incomingMarks) {
    const current = currentById.get(incoming.id)
    if (!current) {
      plan.added.push({ status: 'new', incoming })
    } else if (markSemantics(current) === markSemantics(incoming)) {
      plan.duplicates.push({ status: 'duplicate', incoming })
    } else {
      plan.conflicts.push({ status: 'conflict', incoming, current })
    }
  }

  // 不同 ID 但定位与说明完全一致的标记也视为重复，避免同一工程包改名导出后再次堆叠。
  for (const entry of plan.added) {
    if (currentSemanticKeys.has(markSemantics(entry.incoming))) {
      entry.status = 'duplicate'
      plan.duplicates.push(entry)
    }
  }
  plan.added = plan.added.filter((entry) => entry.status === 'new')

  return plan
}

export function unresolvedConflicts(plan: MarkMergePlan, resolutions: Record<string, ConflictResolution>): MarkMergeEntry[] {
  return plan.conflicts.filter((entry) => !resolutions[entry.incoming.id])
}

/**
 * 按用户选择应用合并：
 * - 新增标记原样并入（保留导入方 id，因此同一包再次导入时会被识别为重复）；
 * - 完全重复跳过；
 * - 冲突项 current 保留当前版本，incoming 用导入版本整体替换。
 */
export function mergeMarks(
  currentMarks: RehearsalMark[],
  plan: MarkMergePlan,
  resolutions: Record<string, ConflictResolution>,
): RehearsalMark[] {
  const remaining = unresolvedConflicts(plan, resolutions)
  if (remaining.length) {
    throw new Error(`还有 ${remaining.length} 个同 ID 冲突标记未选择保留版本。`)
  }

  const merged = [...currentMarks]
  for (const entry of plan.added) {
    if (!merged.some((mark) => mark.id === entry.incoming.id)) merged.push(entry.incoming)
  }
  for (const entry of plan.conflicts) {
    if (resolutions[entry.incoming.id] !== 'incoming') continue
    const index = merged.findIndex((mark) => mark.id === entry.incoming.id)
    if (index >= 0) merged[index] = entry.incoming
  }
  return merged
}
