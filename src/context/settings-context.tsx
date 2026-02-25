"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { AppSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { useAuthContext } from "./auth-context";

type SettingsAction =
  | { type: "SET_SETTINGS"; payload: AppSettings }
  | { type: "UPDATE_SETTINGS"; payload: Partial<AppSettings> }
  | { type: "RESET" };

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
}

function mergeSettings(
  current: AppSettings,
  updates: Partial<AppSettings>
): AppSettings {
  return {
    ...current,
    ...updates,
    defaults: {
      ...current.defaults,
      ...(updates.defaults || {}),
    },
    appearance: {
      ...current.appearance,
      ...(updates.appearance || {}),
    },
    ai: {
      ...current.ai,
      ...(updates.ai || {}),
    },
  };
}

function settingsReducer(
  state: SettingsState,
  action: SettingsAction
): SettingsState {
  switch (action.type) {
    case "SET_SETTINGS":
      return { ...state, settings: action.payload, loaded: true };
    case "UPDATE_SETTINGS":
      return {
        ...state,
        settings: mergeSettings(state.settings, action.payload),
      };
    case "RESET":
      return { ...state, settings: DEFAULT_SETTINGS };
    default:
      return state;
  }
}

const SettingsContext = createContext<{
  state: SettingsState;
  dispatch: React.Dispatch<SettingsAction>;
  saveSettings: (updates: Partial<AppSettings>) => Promise<{ success: boolean; error?: string }>;
} | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user, userProfile, initialData } = useAuthContext();
  const orgId = userProfile?.orgId ?? null;

  const [state, baseDispatch] = useReducer(settingsReducer, {
    settings: DEFAULT_SETTINGS,
    loaded: false,
  });

  // Keep a ref to the latest state so async functions always see current values
  const stateRef = useRef(state);
  stateRef.current = state;

  const getToken = useCallback(async () => {
    if (!user) return null;
    return user.getIdToken();
  }, [user]);

  // Use initialData from auth context (pre-fetched in single API call)
  useEffect(() => {
    if (!orgId) {
      baseDispatch({ type: "SET_SETTINGS", payload: DEFAULT_SETTINGS });
      return;
    }
    if (initialData) {
      baseDispatch({
        type: "SET_SETTINGS",
        payload: { ...DEFAULT_SETTINGS, ...initialData.settings },
      });
    }
  }, [orgId, initialData]);

  // Explicit save function that persists to the API and returns success/failure
  const saveSettings = useCallback(
    async (
      updates: Partial<AppSettings>
    ): Promise<{ success: boolean; error?: string }> => {
      // Merge updates with current state to get the FULL settings object
      const fullSettings = mergeSettings(stateRef.current.settings, updates);

      // Update local state immediately
      baseDispatch({ type: "SET_SETTINGS", payload: fullSettings });

      if (!orgId) {
        return { success: false, error: "No organization found" };
      }

      const token = await getToken();
      if (!token) {
        return { success: false, error: "Not authenticated" };
      }

      try {
        const res = await fetch("/api/data/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ settings: fullSettings }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return {
            success: false,
            error: data.error || `Server error (${res.status})`,
          };
        }

        // Update session cache so reloads reflect the saved settings
        try {
          const cached = sessionStorage.getItem("wl_init");
          if (cached) {
            const parsed = JSON.parse(cached);
            parsed.settings = fullSettings;
            sessionStorage.setItem("wl_init", JSON.stringify(parsed));
          }
        } catch {
          // sessionStorage not available — non-critical
        }

        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Network error",
        };
      }
    },
    [orgId, getToken]
  );

  // Dispatch wrapper — updates local state only (no auto-persist)
  const dispatch: React.Dispatch<SettingsAction> = useCallback(
    (action: SettingsAction) => {
      baseDispatch(action);
    },
    []
  );

  return (
    <SettingsContext.Provider value={{ state, dispatch, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsContext must be within SettingsProvider");
  return ctx;
}
