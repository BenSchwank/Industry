import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useEffect, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { queryClient } from '../lib/queryClient'
import {
  asyncStoragePersister,
  PERSIST_MAX_AGE,
  PERSISTED_QUERY_KEYS,
} from '../lib/queryPersister'
import { syncPendingTickets } from '../lib/syncTickets'
import { useAppStore } from '../stores/appStore'
import { useAuthStore } from '../stores/authStore'

function OnlineStatusSync() {
  const setOnline = useAppStore((s) => s.setOnline)

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      syncPendingTickets()
    }
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setOnline])

  return null
}

function AuthInit() {
  const applySessionGate = useAuthStore((s) => s.applySessionGate)
  const setInitialized = useAuthStore((s) => s.setInitialized)

  useEffect(() => {
    let done = false
    let ignoreNext = false

    const finish = async (session: Parameters<typeof applySessionGate>[0]) => {
      if (done) return
      done = true
      ignoreNext = true
      await applySessionGate(session)
      ignoreNext = false
      setInitialized(true)
    }

    const timeout = window.setTimeout(() => {
      console.warn('[KWD] Auth-Timeout – App startet ohne Session.')
      void finish(null)
    }, 4000)

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout)
        void finish(session)
      })
      .catch((err) => {
        console.error('[KWD] Auth-Fehler:', err)
        clearTimeout(timeout)
        void finish(null)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (ignoreNext) return
      if (!useAuthStore.getState().initialized) return
      void applySessionGate(session)
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [applySessionGate, setInitialized])

  return null
}

function AiQueueProcessor() {
  useEffect(() => {
    import('../lib/aiAnalysisQueue').then(({ processAiQueue }) => processAiQueue())
  }, [])
  return null
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: PERSIST_MAX_AGE,
        // Cache invalidieren wenn Listen-Query-Fallback geändert wurde (alte 6er-Snapshot)
        buster: 'machines-list-fallback-v2',
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0]
            return typeof key === 'string' && PERSISTED_QUERY_KEYS.includes(key as never)
          },
        },
      }}

    >
      <AuthInit />
      <OnlineStatusSync />
      <AiQueueProcessor />
      {children}
    </PersistQueryClientProvider>
  )
}
