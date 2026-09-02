"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/utils/firebase";
import { fetchUserDoc } from "@/utils/auth";
import type { UserDoc } from "@/types";

interface AuthState {
  firebaseUser: User | null;
  userDoc: UserDoc | null;
  isLoading: boolean;
}

export const useAuthUser = (): AuthState => {
  const [state, setState] = useState<AuthState>({
    firebaseUser: null,
    userDoc: null,
    isLoading: true,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (firebaseUser) => {
      if (!firebaseUser) {
        setState({ firebaseUser: null, userDoc: null, isLoading: false });
        return;
      }

      const userDoc = await fetchUserDoc(firebaseUser.uid);
      setState({ firebaseUser, userDoc, isLoading: false });
    });

    return unsubscribe;
  }, []);

  return state;
};
