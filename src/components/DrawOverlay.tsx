import { useEffect, useState } from 'react'
import { Button } from './ui'

/** Animated draw of the starting player: cycles through names, slows down, lands on the starter. */
export function DrawOverlay({ names, starterIndex, onDone }: { names: string[]; starterIndex: number; onDone: () => void }) {
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    // Enough steps to go around a few times and stop exactly on the starter.
    const steps = names.length * 3 + starterIndex
    let step = 0
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      step += 1
      setIndex(step % names.length)
      if (step >= steps) {
        setFinished(true)
        return
      }
      // Ease out: delays grow towards the end.
      const progress = step / steps
      timer = setTimeout(tick, 60 + progress * progress * 320)
    }
    timer = setTimeout(tick, 200)
    return () => clearTimeout(timer)
  }, [names.length, starterIndex])

  useEffect(() => {
    if (!finished) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault()
        onDone()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finished, onDone])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/70 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">Losování</p>
        <ul className="space-y-2">
          {names.map((name, i) => (
            <li
              key={name + i}
              className={`rounded-xl px-4 py-2.5 text-lg font-semibold transition-all duration-100 ${
                i === index
                  ? finished
                    ? 'scale-105 bg-brand-600 text-white shadow-lg'
                    : 'bg-brand-100 text-brand-800'
                  : 'bg-stone-50 text-stone-500'
              }`}
            >
              {name}
            </li>
          ))}
        </ul>
        <div className="mt-5 min-h-24">
          {finished && (
            <>
              <p className="text-2xl font-extrabold">
                Začíná: <span className="text-brand-700">{names[starterIndex]}</span>
              </p>
              <Button size="lg" className="mt-4 w-full" onClick={onDone} autoFocus>
                Hrát
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
