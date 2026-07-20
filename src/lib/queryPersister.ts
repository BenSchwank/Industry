import { get, set, del } from 'idb-keyval'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'

const IDB_KEY = 'kwd-query-cache'

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => {
      const value = await get<string>(key === 'kwd-query-cache' ? IDB_KEY : key)
      return value ?? null
    },
    setItem: async (key, value) => {
      await set(key === 'kwd-query-cache' ? IDB_KEY : key, value)
    },
    removeItem: async (key) => {
      await del(key === 'kwd-query-cache' ? IDB_KEY : key)
    },
  },
  key: IDB_KEY,
  throttleTime: 1000,
})

export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24 * 7 // 7 Tage

export const PERSISTED_QUERY_KEYS = [
  'machines-with-stats',
  'machines',
  'machines-select',
  'machine-timeline',
  'machine-health',
  'machine-attachments',
  'inventory-with-stock',
  'tickets',
  'maintenance-tasks',
  'overview-stats',
  'maintenance-drafts',
] as const
