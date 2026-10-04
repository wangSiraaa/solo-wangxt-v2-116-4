import type { ProjectExport, RehearsalMark, StoredProject } from '../score/types'

const databaseName = 'rehearsal-stand'
const storeName = 'projects'
const version = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, version)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listProjects(): Promise<StoredProject[]> {
  const database = await openDatabase()
  try {
    const result = await requestPromise(database.transaction(storeName, 'readonly').objectStore(storeName).getAll())
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } finally {
    database.close()
  }
}

export async function saveProject(project: StoredProject): Promise<void> {
  const database = await openDatabase()
  try {
    await requestPromise(database.transaction(storeName, 'readwrite').objectStore(storeName).put(project))
  } finally {
    database.close()
  }
}

export async function deleteProject(id: string): Promise<void> {
  const database = await openDatabase()
  try {
    await requestPromise(database.transaction(storeName, 'readwrite').objectStore(storeName).delete(id))
  } finally {
    database.close()
  }
}

export function createProject(name: string, originalXml: string): StoredProject {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    originalXml,
    marks: [],
    updatedAt: now,
    createdAt: now,
  }
}

export function exportProject(project: StoredProject): ProjectExport {
  return {
    format: 'local-rehearsal-project/v1',
    project: JSON.parse(JSON.stringify(project)) as StoredProject,
  }
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function normalizeMark(mark: RehearsalMark, index: number): RehearsalMark {
  const measureIndex = Number(mark.measureIndex)
  if (!Number.isInteger(measureIndex) || measureIndex < 0) {
    throw new Error(`第 ${index + 1} 个排练标记缺少有效的书面小节位置。`)
  }
  if (typeof mark.id !== 'string' || !mark.id) throw new Error(`第 ${index + 1} 个排练标记缺少 ID。`)

  const occurrence = mark.occurrence === undefined ? undefined : Number(mark.occurrence)
  if (occurrence !== undefined && (!Number.isInteger(occurrence) || occurrence < 1)) {
    throw new Error(`第 ${index + 1} 个排练标记缺少有效的到达次数。`)
  }

  return {
    id: mark.id,
    measureIndex,
    occurrence,
    label: String(mark.label ?? ''),
    comment: String(mark.comment ?? ''),
    color: String(mark.color ?? '#f4b942'),
    createdAt: typeof mark.createdAt === 'string' && mark.createdAt ? mark.createdAt : new Date(0).toISOString(),
  }
}

export async function importProjectFile(file: File): Promise<StoredProject> {
  const text = await file.text()
  const parsed = JSON.parse(text) as ProjectExport
  if (parsed.format !== 'local-rehearsal-project/v1' || !parsed.project?.originalXml) {
    throw new Error('不是有效的 local-rehearsal-project/v1 工程文件。')
  }
  if (!Array.isArray(parsed.project.marks)) {
    throw new Error('工程文件中的 marks 必须是数组。')
  }

  return {
    ...parsed.project,
    marks: parsed.project.marks.map(normalizeMark),
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  }
}
