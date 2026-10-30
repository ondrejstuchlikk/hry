import { useEffect } from 'react'

/**
 * Keeps the screen on while the component is mounted (Screen Wake Lock API).
 * The browser drops the lock when the page is hidden, so it is re-requested on return.
 * Unsupported browsers (iOS home-screen apps before 18.4) silently keep the normal auto-lock.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let active = true

    const request = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (active) lock = sentinel
        else void sentinel.release()
      } catch {
        // Denied (e.g. Low Power Mode) — not worth bothering the user.
      }
    }

    void request()
    document.addEventListener('visibilitychange', request)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', request)
      void lock?.release()
    }
  }, [])
}
