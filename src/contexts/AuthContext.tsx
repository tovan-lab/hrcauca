import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, UserStatus } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function fetchUserProfile(userId: string): Promise<User | null> {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).single(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ]);

  if (!profile) return null;

  const role = (roles?.[0]?.role as UserRole) || 'EMPLOYEE';

  // Check is_active — if false, treat as inactive
  const isActive = (profile as any).is_active;
  let status = (profile.status as UserStatus) || 'pending';
  if (isActive === false) status = 'inactive';

  // Fetch branch name if branch_id exists
  let branchName: string | undefined;
  const branchId = (profile as any).branch_id;
  if (branchId) {
    const { data: branch } = await supabase.from('branches').select('branch_name').eq('id', branchId).single();
    if (branch) branchName = branch.branch_name;
  }

  // Generate signed URL for avatar if it's a storage path
  let avatarUrl = profile.avatar_url || undefined;
  if (avatarUrl && avatarUrl.includes('checkin-images')) {
    // Extract the path from the URL
    const match = avatarUrl.match(/checkin-images\/(.+?)(\?|$)/);
    if (match) {
      const { data: signedData } = await supabase.storage
        .from('checkin-images')
        .createSignedUrl(match[1], 3600);
      if (signedData?.signedUrl) avatarUrl = signedData.signedUrl;
    }
  }

  return {
    id: userId,
    name: profile.name || profile.email,
    email: profile.email,
    role,
    status,
    department: profile.department || undefined,
    avatar: avatarUrl,
    branch_id: branchId || null,
    branch_name: branchName,
    is_active: isActive !== false,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const profile = await fetchUserProfile(userId);
    setUser(profile);
    setLoading(false);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          setTimeout(() => loadProfile(session.user.id), 0);
        } else {
          setUser(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    // Check if account is active
    if (data.user) {
      const { data: profile } = await supabase.from('profiles').select('is_active, status').eq('user_id', data.user.id).single();
      if (profile && ((profile as any).is_active === false || profile.status === 'inactive')) {
        await supabase.auth.signOut();
        return { error: 'Tài khoản bị khóa. Vui lòng liên hệ quản trị viên.' };
      }
    }

    return {};
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    if (error) return { error: error.message };
    return {};
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await loadProfile(session.user.id);
    }
  }, [session, loadProfile]);

  return (
    <AuthContext.Provider value={{ user, session, login, register, logout, refreshProfile, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
