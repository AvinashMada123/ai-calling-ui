"use client";

import { useSettingsContext } from "@/context/settings-context";
import type { AppSettings } from "@/types/settings";

export function useSettings() {
  const { state, dispatch, saveSettings } = useSettingsContext();

  return {
    settings: state.settings,
    loaded: state.loaded,

    /** Save settings to Firestore. Returns { success, error? }. */
    saveSettings: (updates: Partial<AppSettings>) => saveSettings(updates),

    /** Update local state only (no persist). Use saveSettings for persistence. */
    updateSettings: (updates: Partial<AppSettings>) => {
      dispatch({ type: "UPDATE_SETTINGS", payload: updates });
    },

    resetToDefaults: () => saveSettings({
      defaults: { clientName: "", agentName: "", companyName: "", eventName: "", eventHost: "", voice: "Puck", location: "" },
      webhookUrl: "",
      ghlWhatsappWebhookUrl: "",
      ghlApiKey: "",
      ghlLocationId: "",
      plivoAuthId: "",
      plivoAuthToken: "",
      plivoPhoneNumber: "",
      ai: { autoQualify: true },
      appearance: { sidebarCollapsed: false, animationsEnabled: true },
    }),
  };
}
