<template>
  <div v-if="preview" class="modal-backdrop" role="presentation" @click.self="$emit('cancel')">
    <section class="merge-modal" role="dialog" aria-modal="true" aria-labelledby="merge-title">
      <header>
        <div>
          <h2 id="merge-title">预览并合并标记</h2>
          <p>原始 MusicXML 已逐字比对一致 · 来源：{{ preview.importedProjectName }}</p>
        </div>
        <button class="modal-close" @click="$emit('cancel')">×</button>
      </header>

      <div class="merge-summary">
        <span class="summary added">新增 {{ counts.added }}</span>
        <span class="summary duplicate">完全重复 {{ counts.duplicate }}</span>
        <span class="summary conflict">内容冲突 {{ counts.conflict }}</span>
      </div>

      <div class="merge-list">
        <p v-if="preview.items.length === 0" class="muted">导入工程包中没有排练标记。</p>

        <article v-for="item in preview.items" :key="item.id" :class="['merge-item', item.status]">
          <div class="merge-item-heading">
            <span :class="['merge-status', item.status]">{{ statusLabel(item.status) }}</span>
            <strong>{{ displayMark(item.imported ?? item.current)?.label }}</strong>
            <small>{{ locationText(item.imported ?? item.current) }}</small>
          </div>

          <div v-if="item.status === 'conflict'" class="conflict-grid">
            <label :class="{ chosen: choices[item.id] === 'current' }">
              <input
                type="radio"
                :name="`conflict-${item.id}`"
                value="current"
                :checked="choices[item.id] === 'current'"
                @change="choose(item.id, 'current')"
              />
              <span>保留当前</span>
              <div v-if="item.current" class="mark-details">
                <strong>{{ item.current.label || '（未命名标记）' }}</strong>
                <p>{{ item.current.comment || '（无说明）' }}</p>
                <small>{{ locationText(item.current) }}</small>
              </div>
              <p v-else class="muted">缺少此版本</p>
            </label>
            <label :class="{ chosen: choices[item.id] === 'imported' }">
              <input
                type="radio"
                :name="`conflict-${item.id}`"
                value="imported"
                :checked="choices[item.id] === 'imported'"
                @change="choose(item.id, 'imported')"
              />
              <span>采用导入</span>
              <div v-if="item.imported" class="mark-details">
                <strong>{{ item.imported.label || '（未命名标记）' }}</strong>
                <p>{{ item.imported.comment || '（无说明）' }}</p>
                <small>{{ locationText(item.imported) }}</small>
              </div>
              <p v-else class="muted">缺少此版本</p>
            </label>
          </div>
          <p v-else class="merge-comment">{{ displayMark(item.imported)?.comment || '（无说明）' }}</p>
        </article>
      </div>

      <footer>
        <p v-if="remainingConflicts > 0" class="conflict-required">还有 {{ remainingConflicts }} 个冲突项必须选择。</p>
        <p v-else class="merge-result-text">
          将新增 {{ counts.added }} 个标记，跳过 {{ counts.duplicate }} 个重复标记，处理 {{ counts.conflict }} 个冲突。
        </p>
        <div class="modal-actions">
          <button class="button secondary" @click="$emit('cancel')">取消</button>
          <button class="button primary" :disabled="remainingConflicts > 0" @click="confirm">
            合并并保存
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { BuiltPath, RehearsalMark, WrittenMeasure } from '../score/types'
import {
  applyMarkMerge,
  unresolvedConflicts,
  type ConflictChoices,
  type ConflictResolution,
  type MarkMergePreview,
  type MarkMergeStatus,
} from '../score/markMerge'

const props = defineProps<{
  preview: MarkMergePreview | null
  measures: WrittenMeasure[]
  arrivals: BuiltPath['arrivals']
  currentMarks: RehearsalMark[]
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [marks: RehearsalMark[]]
}>()

const choices = reactive<ConflictChoices>({})

watch(() => props.preview, (preview) => {
  for (const key of Object.keys(choices)) delete choices[key]
  if (!preview) return
  for (const item of preview.items) {
    if (item.status === 'conflict') choices[item.id] = undefined
  }
}, { immediate: true })

const counts = computed(() => ({
  added: props.preview?.items.filter((item) => item.status === 'added').length ?? 0,
  duplicate: props.preview?.items.filter((item) => item.status === 'duplicate').length ?? 0,
  conflict: props.preview?.items.filter((item) => item.status === 'conflict').length ?? 0,
}))

const remainingConflicts = computed(() => props.preview ? unresolvedConflicts(props.preview, choices).length : 0)

function statusLabel(status: MarkMergeStatus): string {
  if (status === 'added') return '新增'
  if (status === 'duplicate') return '完全重复'
  return '内容冲突'
}

function displayMark(mark: RehearsalMark | null | undefined): RehearsalMark | null {
  return mark ?? null
}

function locationText(mark: RehearsalMark | null): string {
  if (!mark) return ''
  const measureNumber = props.measures[mark.measureIndex]?.number ?? `#${mark.measureIndex}`
  const occurrence = mark.occurrence ?? 1
  const reachableCount = props.arrivals.find((arrival) => arrival.measureIndex === mark.measureIndex)?.occurrences.length ?? 0
  return `书面小节 ${measureNumber} · 第 ${occurrence} 次到达${reachableCount ? ` / 共 ${reachableCount} 次` : ''}`
}

function choose(id: string, resolution: ConflictResolution): void {
  choices[id] = resolution
}

function confirm(): void {
  if (!props.preview || remainingConflicts.value > 0) return
  emit('confirm', applyMarkMerge(props.currentMarks, props.preview, choices))
}
</script>
