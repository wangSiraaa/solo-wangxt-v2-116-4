<template>
  <div class="modal-backdrop" @click.self="emit('cancel')">
    <div class="modal">
      <header class="modal-header">
        <h2>预览并合并标记</h2>
        <p>
          工程包“{{ projectName }}”与当前工程的原始 MusicXML 逐字相同，
          标记按书面小节与实际到达次数定位。
        </p>
      </header>

      <div class="merge-summary">
        <span class="chip new">新增 {{ plan.added.length }}</span>
        <span class="chip duplicate">完全重复 {{ plan.duplicates.length }}</span>
        <span class="chip conflict">同 ID 内容不同 {{ plan.conflicts.length }}</span>
      </div>

      <div v-if="!hasAny" class="muted empty-merge">工程包里没有任何排练标记，无需合并。</div>

      <div v-else class="merge-body">
        <section v-if="plan.added.length" class="merge-group">
          <h3>新增标记（确认后加入当前工程）</h3>
          <article v-for="entry in plan.added" :key="`new-${entry.incoming.id}`" class="merge-entry new-entry">
            <div class="entry-head">
              <strong>{{ entry.incoming.label }}</strong>
              <span class="entry-location">{{ locationText(entry.incoming) }}</span>
            </div>
            <p v-if="entry.incoming.comment">{{ entry.incoming.comment }}</p>
          </article>
        </section>

        <section v-if="plan.duplicates.length" class="merge-group">
          <h3>完全重复（自动跳过，不会重复增加）</h3>
          <article v-for="entry in plan.duplicates" :key="`dup-${entry.incoming.id}`" class="merge-entry duplicate-entry">
            <div class="entry-head">
              <strong>{{ entry.incoming.label }}</strong>
              <span class="entry-location">{{ locationText(entry.incoming) }}</span>
            </div>
            <p v-if="entry.incoming.comment">{{ entry.incoming.comment }}</p>
          </article>
        </section>

        <section v-if="plan.conflicts.length" class="merge-group">
          <h3>同 ID 但内容不同（每项必须先选择保留版本）</h3>
          <article v-for="entry in plan.conflicts" :key="`conflict-${entry.incoming.id}`" class="merge-entry conflict-entry">
            <div class="entry-head">
              <strong>{{ entry.incoming.label }}</strong>
              <span class="entry-location">{{ locationText(entry.incoming) }}</span>
            </div>
            <div class="conflict-columns">
              <label :class="['conflict-choice', { chosen: resolutions[entry.incoming.id] === 'current' }]">
                <input
                  type="radio"
                  :name="`conflict-${entry.incoming.id}`"
                  :checked="resolutions[entry.incoming.id] === 'current'"
                  @change="setResolution(entry.incoming.id, 'current')"
                />
                <span class="choice-title">保留当前版本</span>
                <span class="choice-location">{{ entry.current ? locationText(entry.current) : '' }}</span>
                <p v-if="entry.current?.comment">{{ entry.current.comment }}</p>
                <p v-else class="muted">（无说明）</p>
              </label>
              <label :class="['conflict-choice', { chosen: resolutions[entry.incoming.id] === 'incoming' }]">
                <input
                  type="radio"
                  :name="`conflict-${entry.incoming.id}`"
                  :checked="resolutions[entry.incoming.id] === 'incoming'"
                  @change="setResolution(entry.incoming.id, 'incoming')"
                />
                <span class="choice-title">采用导入版本</span>
                <span class="choice-location">{{ locationText(entry.incoming) }}</span>
                <p v-if="entry.incoming.comment">{{ entry.incoming.comment }}</p>
                <p v-else class="muted">（无说明）</p>
              </label>
            </div>
          </article>
        </section>
      </div>

      <footer v-if="hasAny" class="modal-footer">
        <span v-if="remainingCount" class="merge-hint">还有 {{ remainingCount }} 个冲突未选择保留版本</span>
        <span v-else class="merge-hint ok">
          {{ plan.added.length }} 个新增将并入，{{ plan.duplicates.length }} 个重复将跳过
        </span>
        <div class="modal-actions">
          <button class="button secondary" @click="emit('cancel')">取消</button>
          <button class="button primary" :disabled="remainingCount > 0" @click="emit('confirm', resolutions)">合并到当前工程</button>
        </div>
      </footer>
      <footer v-else class="modal-footer">
        <div class="modal-actions">
          <button class="button primary" @click="emit('cancel')">关闭</button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { BuiltPath, RehearsalMark } from '../score/types'
import { arrivalsFor } from '../score/parser'
import {
  unresolvedConflicts,
  type ConflictResolution,
  type MarkMergePlan,
} from '../score/markMerge'

const props = defineProps<{
  plan: MarkMergePlan
  projectName: string
  measures: { index: number; number: string }[]
  path: BuiltPath | null
}>()

const emit = defineEmits<{
  cancel: []
  confirm: [resolutions: Record<string, ConflictResolution>]
}>()

const resolutions = reactive<Record<string, ConflictResolution>>({})

const hasAny = computed(() =>
  props.plan.added.length + props.plan.duplicates.length + props.plan.conflicts.length > 0,
)
const remainingCount = computed(() => unresolvedConflicts(props.plan, resolutions).length)

function setResolution(id: string, resolution: ConflictResolution): void {
  resolutions[id] = resolution
}

function locationText(mark: RehearsalMark): string {
  const measure = props.measures[mark.measureIndex]
  const number = measure ? measure.number : `#${mark.measureIndex}`
  if (mark.occurrence === undefined || mark.occurrence === null) return `书面小节 ${number}`
  const arrivals = props.path ? arrivalsFor(props.path, mark.measureIndex) : []
  const valid = arrivals.includes(mark.occurrence)
  return `书面小节 ${number} · 第 ${mark.occurrence} 次到达${valid ? '' : '（当前路径不存在该次数）'}`
}
</script>
