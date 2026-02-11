import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Organization } from "@/types/user";
import type { AppSettings } from "@/types/settings";

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const snap = await getDoc(doc(db, "organizations", orgId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Organization;
}

export async function updateOrganization(orgId: string, updates: Partial<Organization>): Promise<void> {
  await updateDoc(doc(db, "organizations", orgId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function getAllOrganizations(): Promise<Organization[]> {
  const snap = await getDocs(collection(db, "organizations"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Organization));
}

export async function getOrgSettings(orgId: string): Promise<AppSettings | null> {
  const snap = await getDoc(doc(db, "organizations", orgId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return (data.settings as AppSettings) ?? null;
}

export async function updateOrgSettings(orgId: string, settings: Partial<AppSettings>): Promise<void> {
  const snap = await getDoc(doc(db, "organizations", orgId));
  if (!snap.exists()) return;
  const current = snap.data().settings ?? {};
  const merged = {
    ...current,
    ...settings,
    defaults: { ...(current.defaults ?? {}), ...(settings.defaults ?? {}) },
    appearance: { ...(current.appearance ?? {}), ...(settings.appearance ?? {}) },
    ai: { ...(current.ai ?? {}), ...(settings.ai ?? {}) },
  };
  await updateDoc(doc(db, "organizations", orgId), {
    settings: merged,
    updatedAt: new Date().toISOString(),
  });
}
