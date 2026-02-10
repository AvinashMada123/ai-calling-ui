"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from "react";
import type { AppSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import { getStorageItem, setStorageItem } from "@/lib/storage";

const STORAGE_KEY = "wavelength_settings";

type SettingsAction =
  | { type: "SET_SETTINGS"; payload: AppSettings }
  | { type: "UPDATE_SETTINGS"; payload: Partial<AppSettings> }
  | { type: "RESET" };

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
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
        settings: {
          ...state.settings,
          ...action.payload,
          defaults: {
            ...state.settings.defaults,
            ...(action.payload.defaults || {}),
          },
          appearance: {
            ...state.settings.appearance,
            ...(action.payload.appearance || {}),
          },
          ai: {
            ...state.settings.ai,
            ...(action.payload.ai || {}),
          },
        },
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
} | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(settingsReducer, {
    settings: DEFAULT_SETTINGS,
    loaded: false,
  });

  useEffect(() => {
    const stored = getStorageItem<AppSettings>(STORAGE_KEY, DEFAULT_SETTINGS);
    dispatch({ type: "SET_SETTINGS", payload: { ...DEFAULT_SETTINGS, ...stored } });
  }, []);

  useEffect(() => {
    if (state.loaded) {
      setStorageItem(STORAGE_KEY, state.settings);
    }
  }, [state.settings, state.loaded]);

  return (
    <SettingsContext.Provider value={{ state, dispatch }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettingsContext must be within SettingsProvider");
  return ctx;
}
