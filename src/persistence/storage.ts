import type { WorkspaceState } from '../data/types'

const DB_NAME = 'prism-eda'
const STORE_NAME = 'workspace'
const WORKSPACE_KEY = 'current'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable in this browser.'))
      return
    }
    const request = window.indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local workspace storage.'))
  })
}

export async function saveWorkspace(state: WorkspaceState): Promise<void> {
  try {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).put(state, WORKSPACE_KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the local workspace.'))
    })
    database.close()
  } catch {
    // Persistence is a progressive enhancement. The UI remains usable in memory.
  }
}

export async function loadWorkspace(): Promise<WorkspaceState | null> {
  try {
    const database = await openDatabase()
    const state = await new Promise<WorkspaceState | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(WORKSPACE_KEY)
      request.onsuccess = () => resolve((request.result as WorkspaceState | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error('Could not load the local workspace.'))
    })
    database.close()
    return state
  } catch {
    return null
  }
}

