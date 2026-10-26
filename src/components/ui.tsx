import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:bg-stone-300',
  secondary:
    'bg-surface text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50 active:bg-stone-100 disabled:text-stone-400',
  danger: 'bg-surface text-red-700 ring-1 ring-red-300 hover:bg-red-50 active:bg-red-100 disabled:text-stone-400',
  ghost: 'text-stone-700 hover:bg-stone-200/60 active:bg-stone-200 disabled:text-stone-400',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2.5 text-base', lg: 'px-6 py-4 text-lg' }
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-stone-200 sm:p-5 ${className}`}>{children}</div>
}

export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={`mb-3 text-lg font-bold text-stone-800 ${className}`}>{children}</h2>
}

export function Spinner({ label = 'Načítám…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-stone-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" />
      {label}
    </div>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-stone-500">{children}</p>
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
      {children}
    </p>
  )
}

/** Czech-friendly message for an unknown error. */
export function errorMessage(error: unknown): string {
  const message = (error as { message?: string } | null)?.message
  return message ? `Něco se pokazilo: ${message}` : 'Něco se pokazilo'
}
