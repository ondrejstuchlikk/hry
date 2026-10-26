import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { DrawOverlay } from '../components/DrawOverlay'
import { EmptyState, errorMessage, ErrorText, Spinner } from '../components/ui'
import { gameModules } from '../games'
import { loadSessionDetail } from '../lib/api'
import type { SessionDetail } from '../lib/types'

export function SessionPage() {
  const { sessionId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [detail, setDetail] = useState<SessionDetail | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  // Bumped after ending, so the result view mounts with fresh data.
  const [version, setVersion] = useState(0)

  const load = useCallback(async () => {
    try {
      setDetail(await loadSessionDetail(sessionId))
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [sessionId])

  useEffect(() => {
    load()
  }, [load, version])

  const showDraw = searchParams.get('los') === '1'
  const finishDraw = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams])
  // Alphabetical, so the list does not reveal the drawn turn order (players[0] starts).
  const draw = useMemo(() => {
    const players = detail?.players ?? []
    const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, 'cs'))
    return { names: sorted.map((p) => p.name), starterIndex: Math.max(0, sorted.indexOf(players[0])) }
  }, [detail])

  if (error) return <ErrorText>{error}</ErrorText>
  if (detail === undefined) return <Spinner />
  if (detail === null) {
    return (
      <EmptyState>
        Hra nenalezena. <Link to="/" className="text-brand-700 underline">Zpět na hry</Link>
      </EmptyState>
    )
  }

  const module = gameModules[detail.gameType.id]
  if (!module) return <EmptyState>Tuto hru zatím aplikace neumí.</EmptyState>

  if (detail.session.status === 'ended') return <module.SessionResult key={version} detail={detail} />

  return (
    <>
      <module.SessionScreen key={version} detail={detail} onEnded={() => {
          setDetail(undefined)
          setVersion((v) => v + 1)
        }} />
      {showDraw && detail.entries.length === 0 && (
        <DrawOverlay names={draw.names} starterIndex={draw.starterIndex} onDone={finishDraw} />
      )}
    </>
  )
}
