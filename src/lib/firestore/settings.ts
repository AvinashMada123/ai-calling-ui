import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AppSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/lib/constants";

export async function getOrgSettings(orgId: string): Promise<AppSettings> {
  const snap = await getDoc(doc(db, "organizations", orgId));
  if (!snap.exists()) return DEFAULT_SETTINGS;
  const data = snap.data();
  return (data.settings as AppSettings) || DEFAULT_SETTINGS;
}

export async function updateOrgSettings(orgId: string, settings: AppSettings): Promise<void> {
  await updateDoc(doc(db, "organizations", orgId), {
    settings,
    updatedAt: new Date().toISOString(),
  });
}
