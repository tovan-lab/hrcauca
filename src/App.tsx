import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/contexts/AuthContext';
import { CheckInProvider } from '@/contexts/CheckInContext';
import { EvaluationProvider } from '@/contexts/EvaluationContext';
import { PenaltyProvider } from '@/contexts/PenaltyContext';
import { AppLayout } from '@/components/AppLayout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Index from './pages/Index';
import LoginPage from './pages/LoginPage';
import PendingPage from './pages/PendingPage';
import DashboardPage from './pages/DashboardPage';
import CheckInPage from './pages/CheckInPage';
import EvaluationPage from './pages/EvaluationPage';
import EmployeesPage from './pages/EmployeesPage';
import LogsPage from './pages/LogsPage';
import SettingsPage from './pages/SettingsPage';
import FeedbackPage from './pages/FeedbackPage';
import ShiftPage from './pages/ShiftPage';
import MyLogsPage from './pages/MyLogsPage';
import BranchesPage from './pages/BranchesPage';
import MyPerformancePage from './pages/MyPerformancePage';
import ShiftLogsPage from './pages/ShiftLogsPage';
import EmployeeReportPage from './pages/EmployeeReportPage';
import StorageManagementPage from './pages/StorageManagementPage';
import SystemSettingsPage from './pages/SystemSettingsPage';
import ChatAuditPage from './pages/ChatAuditPage';
import HRHubPage from './pages/HRHubPage';
import EarlyCheckoutRequestsPage from './pages/EarlyCheckoutRequestsPage';
import UnsubscribePage from './pages/UnsubscribePage';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <AuthProvider>
        <CheckInProvider>
          <EvaluationProvider>
            <PenaltyProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/pending" element={<PendingPage />} />
                  <Route path="/" element={<Index />} />
                  <Route path="/dashboard" element={<ProtectedRoute roles={['ADMIN', 'HR']}><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/check-in" element={<ProtectedRoute roles={['EMPLOYEE']}><AppLayout><CheckInPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/my-performance" element={<ProtectedRoute roles={['EMPLOYEE']}><AppLayout><MyPerformancePage /></AppLayout></ProtectedRoute>} />
                  <Route path="/my-checkins" element={<ProtectedRoute roles={['EMPLOYEE']}><AppLayout><MyLogsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/shifts" element={<ProtectedRoute roles={['EMPLOYEE']}><AppLayout><ShiftPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/feedback" element={<ProtectedRoute roles={['EMPLOYEE']}><AppLayout><FeedbackPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/evaluation" element={<ProtectedRoute roles={['ADMIN', 'HR']}><AppLayout><EvaluationPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/employees" element={<ProtectedRoute roles={['ADMIN', 'HR']}><AppLayout><EmployeesPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/logs" element={<ProtectedRoute roles={['ADMIN', 'HR']}><AppLayout><LogsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/shift-logs" element={<ProtectedRoute roles={['ADMIN', 'HR']}><AppLayout><ShiftLogsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/employee-report" element={<ProtectedRoute roles={['ADMIN', 'HR']}><AppLayout><EmployeeReportPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/settings" element={<ProtectedRoute roles={['ADMIN', 'HR', 'EMPLOYEE', 'IT']}><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/system-settings" element={<ProtectedRoute roles={['IT']}><AppLayout><SystemSettingsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/api-management" element={<ProtectedRoute roles={['IT', 'HR']}><AppLayout><SystemSettingsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/chat-audit" element={<ProtectedRoute roles={['IT']}><AppLayout><ChatAuditPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/branches" element={<ProtectedRoute roles={['ADMIN']}><AppLayout><BranchesPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/storage" element={<ProtectedRoute roles={['IT']}><AppLayout><StorageManagementPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/hr-hub" element={<ProtectedRoute roles={['ADMIN', 'HR']}><AppLayout><HRHubPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/early-checkout-requests" element={<ProtectedRoute roles={['HR']}><AppLayout><EarlyCheckoutRequestsPage /></AppLayout></ProtectedRoute>} />
                  <Route path="/unsubscribe" element={<UnsubscribePage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </PenaltyProvider>
          </EvaluationProvider>
        </CheckInProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
