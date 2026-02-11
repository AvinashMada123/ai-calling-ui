import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { adminDb } from "@/lib/firebase-admin";
import type { UserRole } from "@/types/user";

const SESSION_COOKIE_NAME = "__session";

export interface AuthenticatedUser {
  uid: string;
  email: string;
  orgId: string;
  role: UserRole;
}

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  try {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) return null;

    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userDoc.exists) return null;

    const data = userDoc.data()!;
    return {
      uid: decoded.uid,
      email: data.email,
      orgId: data.orgId,
      role: data.role,
    };
  } catch {
    return null;
  }
}

export async function requireAuth(
  request: NextRequest
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireRole(
  request: NextRequest,
  roles: UserRole[]
): Promise<AuthenticatedUser> {
  const user = await requireAuth(request);
  if (!roles.includes(user.role)) {
    throw new Error("Forbidden");
  }
  return user;
}
