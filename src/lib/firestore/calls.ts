import { collection, doc, getDocs, setDoc, updateDoc, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CallRecord } from "@/types/call";

function callsCol(orgId: string) {
  return collection(db, "organizations", orgId, "calls");
}

export async function getCalls(orgId: string): Promise<CallRecord[]> {
  const q = query(callsCol(orgId), orderBy("initiatedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CallRecord));
}

export async function addCall(orgId: string, call: CallRecord): Promise<void> {
  await setDoc(doc(db, "organizations", orgId, "calls", call.id), call);
}

export async function updateCall(orgId: string, callId: string, updates: Partial<CallRecord>): Promise<void> {
  await updateDoc(doc(db, "organizations", orgId, "calls", callId), updates);
}

export async function getCallByUuid(orgId: string, callUuid: string): Promise<CallRecord | null> {
  const q = query(callsCol(orgId), where("callUuid", "==", callUuid));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as CallRecord;
}
