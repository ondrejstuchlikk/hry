import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { EmptyState, errorMessage, ErrorText, Spinner } from '../components/ui'
import { gameModules } from '../games'
import { loadSessionDetail } from '../lib/api'
import type { SessionDetail } from '../lib/types'
import { useWakeLock } from '../lib/useWakeLock'

export function SessionPage() {
  const { sessionId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<SessionDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  // Players wait between turns; keep the phone from dimming and locking on any game screen.
  useWakeLock()

  // Always fresh data from the DB when a game is opened.
  useEffect(() => {
    setDetail(undefined)
    loadSessionDetail(sessionId)
      .then((d) => {
        setDetail(d)
        setError(null)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [sessionId])

  // `?los=1` (set right after creating a game) shows the initial draw once.
  const showDraw = searchParams.get('los') === '1'
  const onDrawShown = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams])

  if (error) return <ErrorText>{error}</ErrorText>
  if (detail === undefined) return <Spinner />
  if (detail === null) {
    return (
      <EmptyState>
        Hra nenalezena. <Link to="/" className="text-accent underline">Zpět na hry</Link>
      </EmptyState>
    )
  }

  const module = gameModules[detail.gameType.id]
  if (!module) return <EmptyState>Tuto hru zatím aplikace neumí.</EmptyState>

  return <module.SessionScreen key={detail.session.id} detail={detail} showDraw={showDraw} onDrawShown={onDrawShown} />
}
