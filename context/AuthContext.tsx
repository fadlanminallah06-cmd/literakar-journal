"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type UserRole = "student" | "teacher" | "admin";

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  classCode?: string;
  gender?: string;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  logout: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let profileTimeout: ReturnType<typeof setTimeout> | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      // Bersihkan listener profil dari sesi sebelumnya (kalau ada)
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      if (profileTimeout) {
        clearTimeout(profileTimeout);
        profileTimeout = null;
      }

      let resolved = false;

      if (!currentUser) {
        resolved = true;
        setUserProfile(null);
        setLoading(false);
        return;
      }

      // PENTING: pakai onSnapshot (listener real-time), bukan getDoc
      // sekali baca. Ini menghindari race condition dengan setDoc yang
      // sedang berjalan di halaman register — kalau dokumen belum ada
      // saat pertama dibaca, listener ini otomatis menerima update
      // begitu dokumen selesai dibuat, tanpa perlu reload halaman.
      unsubProfile = onSnapshot(
        doc(db, "users", currentUser.uid),
        (snap) => {
          resolved = true;
          if (profileTimeout) clearTimeout(profileTimeout);

          if (snap.exists()) {
            setUserProfile(snap.data() as UserProfile);
          } else {
            setUserProfile(null);
          }
          setLoading(false);
        },
        () => {
          // Error (misal permission-denied)
          resolved = true;
          if (profileTimeout) clearTimeout(profileTimeout);
          setUserProfile(null);
          setLoading(false);
        }
      );

      // Fallback: kalau dalam 5 detik dokumen belum masuk, jangan terpaku
      // di loading selamanya karena profil mungkin belum siap atau memang tidak ada.
      profileTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          setUserProfile(null);
          setLoading(false);
        }
      }, 5000);
    });

    return () => {
      unsubscribeAuth();
      if (unsubProfile) unsubProfile();
      if (profileTimeout) clearTimeout(profileTimeout);
    };
  }, []);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);