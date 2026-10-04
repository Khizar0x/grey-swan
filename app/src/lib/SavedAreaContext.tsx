import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// Renamed "useSavedArea" rather than "useLocation" deliberately — react-
// router-dom already owns that name, and this is unrelated (a remembered
// postcode/area, not the current route).
const STORAGE_KEY = 'greyswan_area'
const PROMPTED_KEY = 'greyswan_area_prompted'

function readStoredArea(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

interface SavedAreaState {
  area: string | null
  setArea: (area: string) => void
  // Whether the "set your area" popover should be open right now — true
  // once on first-ever visit (no saved area yet), and whenever something
  // calls openPrompt() to reuse the same header popover from elsewhere
  // (e.g. a listing page's pickup-distance section with no area set).
  promptOpen: boolean
  openPrompt: () => void
  closePrompt: () => void
}

const SavedAreaContext = createContext<SavedAreaState | null>(null)

export function SavedAreaProvider({ children }: { children: ReactNode }) {
  const [area, setAreaState] = useState<string | null>(() => readStoredArea())
  const [promptOpen, setPromptOpen] = useState(false)

  // First visit only: no saved area and never prompted before. Tracked
  // separately from the area itself so someone who opens the prompt and
  // closes it without saving isn't re-prompted on every page load.
  useEffect(() => {
    let alreadyPrompted = false
    try {
      alreadyPrompted = localStorage.getItem(PROMPTED_KEY) === '1'
    } catch {
      alreadyPrompted = false
    }
    if (!alreadyPrompted && !readStoredArea()) {
      setPromptOpen(true)
      try {
        localStorage.setItem(PROMPTED_KEY, '1')
      } catch {
        // localStorage unavailable — this'll just prompt again next visit,
        // which is harmless (no account, nothing to desync).
      }
    }
  }, [])

  const setArea = useCallback((value: string) => {
    const trimmed = value.trim()
    setAreaState(trimmed || null)
    try {
      if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed)
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // localStorage unavailable — still works for the rest of this page load.
    }
  }, [])

  return (
    <SavedAreaContext.Provider
      value={{ area, setArea, promptOpen, openPrompt: () => setPromptOpen(true), closePrompt: () => setPromptOpen(false) }}
    >
      {children}
    </SavedAreaContext.Provider>
  )
}

export function useSavedArea(): SavedAreaState {
  const ctx = useContext(SavedAreaContext)
  if (!ctx) throw new Error('useSavedArea must be used within SavedAreaProvider')
  return ctx
}
