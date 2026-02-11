import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, orderBy, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Lead } from "@/types/lead";

function leadsCol(orgId: string) {
  return collection(db, "organizations", orgId, "leads");
}

export async function getLeads(orgId: string): Promise<Lead[]> {
  const q = query(leadsCol(orgId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Lead));
}

export async function addLead(orgId: string, lead: Lead): Promise<void> {
  await setDoc(doc(db, "organizations", orgId, "leads", lead.id), lead);
}

export async function addLeadsBulk(orgId: string, leads: Lead[]): Promise<void> {
  const batch = writeBatch(db);
  for (const lead of leads) {
    batch.set(doc(db, "organizations", orgId, "leads", lead.id), lead);
  }
  await batch.commit();
}

export async function updateLead(orgId: string, leadId: string, updates: Partial<Lead>): Promise<void> {
  await updateDoc(doc(db, "organizations", orgId, "leads", leadId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteLeads(orgId: string, leadIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  for (const id of leadIds) {
    batch.delete(doc(db, "organizations", orgId, "leads", id));
  }
  await batch.commit();
}

export async function incrementCallCount(orgId: string, leadId: string): Promise<void> {
  await updateDoc(doc(db, "organizations", orgId, "leads", leadId), {
    callCount: increment(1),
    lastCallDate: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function getLeadByPhone(orgId: string, phone: string): Promise<Lead | null> {
  // Query leads by phone number
  const snap = await getDocs(leadsCol(orgId));
  const match = snap.docs.find((d) => d.data().phoneNumber === phone);
  if (!match) return null;
  return { id: match.id, ...match.data() } as Lead;
}
