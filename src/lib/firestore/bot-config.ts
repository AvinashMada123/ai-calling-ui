import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BotConfig } from "@/types/bot-config";

export { DEFAULT_BOT_CONFIG } from "@/lib/default-bot-config";

function configsCol(orgId: string) {
  return collection(db, "organizations", orgId, "botConfigs");
}

export async function getBotConfigs(orgId: string): Promise<BotConfig[]> {
  const snap = await getDocs(configsCol(orgId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BotConfig));
}

export async function getActiveBotConfig(orgId: string): Promise<BotConfig | null> {
  const q = query(configsCol(orgId), where("isActive", "==", true));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as BotConfig;
}

export async function createBotConfig(orgId: string, config: BotConfig): Promise<void> {
  await setDoc(doc(db, "organizations", orgId, "botConfigs", config.id), config);
}

export async function updateBotConfig(orgId: string, configId: string, updates: Partial<BotConfig>): Promise<void> {
  await updateDoc(doc(db, "organizations", orgId, "botConfigs", configId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteBotConfig(orgId: string, configId: string): Promise<void> {
  await deleteDoc(doc(db, "organizations", orgId, "botConfigs", configId));
}

export async function setActiveBotConfig(orgId: string, configId: string): Promise<void> {
  // Deactivate all configs first, then activate the chosen one
  const configs = await getBotConfigs(orgId);
  const batch = writeBatch(db);
  for (const c of configs) {
    batch.update(doc(db, "organizations", orgId, "botConfigs", c.id), { isActive: false });
  }
  batch.update(doc(db, "organizations", orgId, "botConfigs", configId), { isActive: true });
  await batch.commit();
}

export async function seedDefaultBotConfig(orgId: string, createdBy: string): Promise<void> {
  const { DEFAULT_BOT_CONFIG } = await import("@/lib/default-bot-config");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await createBotConfig(orgId, {
    ...DEFAULT_BOT_CONFIG,
    id,
    createdAt: now,
    updatedAt: now,
    createdBy,
  });
}
