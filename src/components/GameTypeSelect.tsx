import { useEffect, useState } from 'react'
import { gameModules, sortGameTypes } from '../games'
import { getGameTypes } from '../lib/api'
import type { GameType } from '../lib/types'

export const selectClass =
  'w-full rounded-xl border border-stone-300 bg-surface px-3 py-2.5 font-medium outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

export function GameTypeSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [types, setTypes] = useState<GameType[]>([])
  useEffect(() => {
    getGameTypes()
      .then((t) => setTypes(sortGameTypes(t)))
      .catch(() => setTypes([]))
  }, [])

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-stone-600">Hra</span>
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {types.map((t) => (
          <option key={t.id} value={t.id} disabled={!gameModules[t.id]}>
            {t.name}
            {!gameModules[t.id] && ' (již brzy)'}
          </option>
        ))}
      </select>
    </label>
  )
}
