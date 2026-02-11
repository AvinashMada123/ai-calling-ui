"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserProfile, UserRole } from "@/types/user";

interface AuthState {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  initialized: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    orgName: string
  ) => Promise<void>;
  signUpWithInvite: (
    email: string,
    password: string,
    displayName: string,
    inviteId: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() } as UserProfile;
}

async function createSessionCookie(user: User) {
  const idToken = await user.getIdToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[Session] Server returned", res.status, body);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function clearSessionCookie() {
  await fetch("/api/auth/session", { method: "DELETE" });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    userProfile: null,
    loading: true,
    initialized: false,
  });

  const refreshProfile = useCallback(async () => {
    if (!state.user) return;
    const profile = await fetchUserProfile(state.user.uid);
    setState((prev) => ({ ...prev, userProfile: profile }));
  }, [state.user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const profile = await fetchUserProfile(user.uid);
        setState({ user, userProfile: profile, loading: false, initialized: true });
      } else {
        setState({ user: null, userProfile: null, loading: false, initialized: true });
      }
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      await createSessionCookie(user);
      // Update last login
      await setDoc(
        doc(db, "users", user.uid),
        { lastLoginAt: new Date().toISOString() },
        { merge: true }
      );
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      orgName: string
    ) => {
      setState((prev) => ({ ...prev, loading: true }));
      try {
        console.log("[SignUp] Step 1: Creating Firebase Auth user...");
        const { user } = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        console.log("[SignUp] Step 2: Updating profile...");
        await updateProfile(user, { displayName });

        // Create organization
        const orgSlug = orgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        const orgRef = doc(db, "organizations", crypto.randomUUID());
        const now = new Date().toISOString();
        console.log("[SignUp] Step 3: Creating organization in Firestore...");
        await setDoc(orgRef, {
          name: orgName,
          slug: orgSlug,
          plan: "free",
          status: "active",
          webhookUrl: "",
          createdBy: user.uid,
          createdAt: now,
          updatedAt: now,
          settings: {
            defaults: {
              clientName: orgSlug,
              agentName: "Agent",
              companyName: orgName,
              eventName: "",
              eventHost: "",
              voice: "Puck",
              location: "",
            },
            appearance: {
              sidebarCollapsed: false,
              animationsEnabled: true,
            },
            ai: {
              autoQualify: true,
            },
          },
        });

        console.log("[SignUp] Step 4: Creating user profile in Firestore...");
        await setDoc(doc(db, "users", user.uid), {
          email,
          displayName,
          role: "client_admin" as UserRole,
          orgId: orgRef.id,
          status: "active",
          createdAt: now,
          lastLoginAt: now,
        });

        console.log("[SignUp] Step 5: Creating session cookie...");
        try {
          await createSessionCookie(user);
          console.log("[SignUp] Session cookie created.");
        } catch (sessionErr) {
          console.warn("[SignUp] Session cookie failed (non-fatal):", sessionErr);
        }
        console.log("[SignUp] Complete!");
      } finally {
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    []
  );

  const signUpWithInvite = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      inviteId: string
    ) => {
      setState((prev) => ({ ...prev, loading: true }));
      try {
        // Fetch invite details
        const inviteSnap = await getDoc(doc(db, "invites", inviteId));
        if (!inviteSnap.exists()) throw new Error("Invite not found");
        const invite = inviteSnap.data();
        if (invite.status !== "pending") throw new Error("Invite already used");
        if (invite.email !== email) throw new Error("Email does not match invite");

        const { user } = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        await updateProfile(user, { displayName });

        const now = new Date().toISOString();
        // Create user profile with invite's org and role
        await setDoc(doc(db, "users", user.uid), {
          email,
          displayName,
          role: invite.role as UserRole,
          orgId: invite.orgId,
          status: "active",
          createdAt: now,
          lastLoginAt: now,
          invitedBy: invite.invitedBy,
        });

        // Mark invite as accepted
        await setDoc(
          doc(db, "invites", inviteId),
          { status: "accepted" },
          { merge: true }
        );

        await createSessionCookie(user);
      } finally {
        setState((prev) => ({ ...prev, loading: false }));
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await clearSessionCookie();
    await firebaseSignOut(auth);
    setState({
      user: null,
      userProfile: null,
      loading: false,
      initialized: true,
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ ...state, signIn, signUp, signUpWithInvite, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuthContext must be used within AuthProvider");
  return context;
}
