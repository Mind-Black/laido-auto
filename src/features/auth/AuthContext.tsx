import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserSession } from '../../lib/types';
import { DEMO_USERS } from '../../lib/mockStore';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

interface AuthContextType {
  currentUser: UserSession;
  setCurrentUser: (user: UserSession) => void;
  availableUsers: UserSession[];
  isConfigured: boolean;
  isLoggedIn: boolean;
  signInWithOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserSession>(() => {
    if (isSupabaseConfigured) {
      // In configured mode, initialize as empty until authenticated
      return { user_id: '', email: '', role: 'member', is_active: false };
    }
    const saved = localStorage.getItem('laido_active_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore
      }
    }
    return DEMO_USERS[0];
  });

  const syncMembership = useCallback(async (userId: string, email: string) => {
    if (!supabase) return;
    try {
      // Attempt to claim membership if first-time sign in
      await supabase.rpc('claim_membership');
    } catch {
      // Ignored if already claimed
    }

    // Fetch user role from memberships table
    const { data: membership } = await supabase
      .from('memberships')
      .select('role, active')
      .eq('user_id', userId)
      .maybeSingle();

    setCurrentUser({
      user_id: userId,
      email: email,
      role: membership?.role === 'admin' ? 'admin' : 'member',
      is_active: membership?.active ?? true, // active by default if membership exists
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      localStorage.setItem('laido_active_user', JSON.stringify(currentUser));
    }
  }, [currentUser]);

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          syncMembership(session.user.id, session.user.email || 'user@example.com');
        }
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          syncMembership(session.user.id, session.user.email || 'user@example.com');
        } else {
          setCurrentUser({ user_id: '', email: '', role: 'member', is_active: false });
        }
      });

      return () => subscription.unsubscribe();
    }
  }, [syncMembership]);

  const signInWithOtp = async (email: string) => {
    if (isSupabaseConfigured && supabase) {
      const redirectUrl = window.location.origin + window.location.pathname;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });
      if (error) throw error;
    }
  };

  const verifyOtp = async (email: string, token: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (error) throw error;
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
    }
  };

  const signUpWithPassword = async (email: string, password: string) => {
    if (isSupabaseConfigured && supabase) {
      const redirectUrl = window.location.origin + window.location.pathname;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
        },
      });
      if (error) throw error;
    }
  };

  const signOut = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
      setCurrentUser({ user_id: '', email: '', role: 'member', is_active: false });
    } else {
      setCurrentUser(DEMO_USERS[0]);
    }
  };

  const isLoggedIn = isSupabaseConfigured ? Boolean(currentUser.user_id) : true;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        availableUsers: DEMO_USERS,
        isConfigured: isSupabaseConfigured,
        isLoggedIn,
        signInWithOtp,
        verifyOtp,
        signInWithPassword,
        signUpWithPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
