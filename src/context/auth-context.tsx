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
import { auth } from "@/lib/firebase";
import type { UserProfile } from "@/types/user";

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

// Fetch user profile via server API to avoid client-side Firestore issues
async function fetchUserProfile(user: User): Promise<UserProfile | null> {
  try {
    const idToken = await user.getIdToken();
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.profile || null;
  } catch {
    return null;
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
    const profile = await fetchUserProfile(state.user);
    setState((prev) => ({ ...prev, userProfile: profile }));
  }, [state.user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const profile = await fetchUserProfile(user);
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
      const idToken = await user.getIdToken();

      // Server handles session cookie + lastLogin update
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Login failed");
      }

      // Fetch profile after server has set session
      const profile = await fetchUserProfile(user);
      setState({ user, userProfile: profile, loading: false, initialized: true });
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false }));
      throw err;
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
        // Step 1: Create Firebase Auth user (client-side)
        const { user } = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        await updateProfile(user, { displayName });

        // Step 2: Server handles org creation, user profile, and session cookie
        const idToken = await user.getIdToken();
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, displayName, orgName }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Failed to create account");
        }

        // Fetch profile after server has created everything
        const profile = await fetchUserProfile(user);
        setState({ user, userProfile: profile, loading: false, initialized: true });
      } catch (err) {
        setState((prev) => ({ ...prev, loading: false }));
        throw err;
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
        const { user } = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        await updateProfile(user, { displayName });

        const idToken = await user.getIdToken();
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, displayName, inviteId }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "Failed to accept invite");
        }

        const profile = await fetchUserProfile(user);
        setState({ user, userProfile: profile, loading: false, initialized: true });
      } catch (err) {
        setState((prev) => ({ ...prev, loading: false }));
        throw err;
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
