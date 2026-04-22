import {
  LayoutDashboard, Camera, Users, ClipboardList, Settings, LogOut, ChevronDown, Star, TrendingUp, MessageSquare, CalendarClock, Building2, BarChart3, HardDrive, ArrowLeftRight, Hourglass,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { UserRole } from '@/lib/types';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  { title: 'Bảng điều khiển', url: '/dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'HR'] },
  { title: 'Chấm công hàng ngày', url: '/check-in', icon: Camera, roles: ['EMPLOYEE'] },
  { title: 'Đăng ký ca làm', url: '/shifts', icon: CalendarClock, roles: ['EMPLOYEE'] },
  { title: 'Chấm điểm', url: '/evaluation', icon: Star, roles: ['ADMIN', 'HR'] },
  { title: 'Nhân viên', url: '/employees', icon: Users, roles: ['ADMIN', 'HR'] },
  { title: 'Chi nhánh', url: '/branches', icon: Building2, roles: ['ADMIN'] },
  { title: 'Nhật ký chấm công', url: '/logs', icon: ClipboardList, roles: ['ADMIN', 'HR'] },
  { title: 'Nhật ký ca làm', url: '/shift-logs', icon: CalendarClock, roles: ['ADMIN', 'HR'] },
  { title: 'Yêu cầu về sớm', url: '/early-checkout-requests', icon: Hourglass, roles: ['HR'] },
  { title: 'Báo cáo tổng hợp', url: '/employee-report', icon: BarChart3, roles: ['ADMIN', 'HR'] },
  { title: 'Cổng liên kết HR', url: '/hr-hub', icon: ArrowLeftRight, roles: ['ADMIN', 'HR'] },
  { title: 'Quản lý lưu trữ', url: '/storage', icon: HardDrive, roles: ['ADMIN'] },
  { title: 'Nhật ký của tôi', url: '/my-checkins', icon: ClipboardList, roles: ['EMPLOYEE'] },
  { title: 'Hiệu suất', url: '/my-performance', icon: TrendingUp, roles: ['EMPLOYEE'] },
  { title: 'Gửi phản hồi', url: '/feedback', icon: MessageSquare, roles: ['EMPLOYEE'] },
  { title: 'Cài đặt', url: '/settings', icon: Settings, roles: ['ADMIN', 'HR', 'EMPLOYEE'] },
];

export function AppSidebar() {
  const { user, logout } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  if (!user) return null;

  const visible = navItems.filter(n => n.roles.includes(user.role));

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && (
            <div className="px-4 pt-4 pb-2">
              <SidebarGroupLabel className="text-xs tracking-widest uppercase text-sidebar-foreground/50 p-0">
                Hệ thống HR
              </SidebarGroupLabel>
              {user.branch_name && (
                <p className="text-xs text-primary mt-1 flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {user.branch_name}
                </p>
              )}
            </div>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map(item => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">
                {user.name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="flex-1 text-left">
                  <p className="font-medium leading-none">{user.name}</p>
                  <p className="mt-0.5 text-xs text-sidebar-foreground/50">
                    {user.role === 'ADMIN' ? 'HR' : user.role === 'HR' ? 'Quản lý' : 'Nhân viên'}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-sidebar-foreground/40" />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={logout} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
