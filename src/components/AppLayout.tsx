import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { ShiftAIChat } from '@/components/ShiftAIChat';
import { NotificationBell } from '@/components/NotificationBell';
import { useAuth } from '@/contexts/AuthContext';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  useSessionTimeout();

  if (!user) return <>{children}</>;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-3 border-b border-border bg-card px-4 sticky top-0 z-30">
            <SidebarTrigger />
            <h1 className="text-sm font-semibold text-foreground flex-1">HR Performance System</h1>
            <NotificationBell />
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
        <ShiftAIChat />
      </div>
    </SidebarProvider>
  );
}
