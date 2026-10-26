import { useEffect, useRef, type ReactNode } from 'react'

/** Modal dialog. Esc calls onClose; Enter calls onEnter when given. */
export function Dialog({
  open,
  title,
  onClose,
  onEnter,
  children,
  wide = false,
}: {
  open: boolean
  title?: ReactNode
  onClose: () => void
  onEnter?: () => void
  children: ReactNode
  wide?: boolean
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Take focus so typing does not go to the field underneath.
  useEffect(() => {
    const panel = panelRef.current
    if (open && panel && !panel.contains(document.activeElement)) panel.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'Enter' && onEnter && !e.repeat) {
        e.preventDefault()
        onEnter()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, onEnter])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl outline-none bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl sm:p-6 ${wide ? 'sm:max-w-xl' : 'sm:max-w-md'}`}
      >
        {title && <h2 className="mb-4 text-xl font-bold text-stone-900">{title}</h2>}
        {children}
      </div>
    </div>
  )
}
