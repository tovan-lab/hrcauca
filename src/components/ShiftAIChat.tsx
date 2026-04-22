import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Send, X, Loader2, Trash2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  pending_confirmation?: boolean;
}

interface ShiftAIChatProps {
  onDataChanged?: () => void;
}

const CHAT_REQUEST_TIMEOUT_MS = 30000;
const INTERNAL_CONFIRM_MESSAGE = 'confirm';
const INTERNAL_CANCEL_MESSAGE = 'cancel';

const QUICK_ACTIONS_HR = [
  'Hôm nay có bao nhiêu người làm?',
  'Ai làm ca tối nay?',
  'Hôm nay có ai được chấm điểm không?',
  'Thống kê chấm công tuần này',
  'Danh sách nhân viên đi muộn',
  'Danh sách chi nhánh hiện có',
];

const QUICK_ACTIONS_ADMIN = [
  ...QUICK_ACTIONS_HR,
  'Cho nhân viên A nghỉ hôm nay',
  'Thêm ca cho nhân viên B',
];

function appendAssistantMessage(
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  content: string,
) {
  setMessages(prev => [...prev, { role: 'assistant', content }]);
}

export function ShiftAIChat({ onDataChanged }: ShiftAIChatProps) {
  const { user, session } = useAuth();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === 'ADMIN';
  const isEmployee = !user || user.role === 'EMPLOYEE';
  const canManageShifts = !!user && user.role !== 'EMPLOYEE';
  const quickActions = isAdmin ? QUICK_ACTIONS_ADMIN : QUICK_ACTIONS_HR;

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      }
    }, 80);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  if (isEmployee) return null;

  const sendMessage = async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || loading) return;

    const isInternalAction = msgText === INTERNAL_CONFIRM_MESSAGE || msgText === INTERNAL_CANCEL_MESSAGE;
    const userMsg: Message = { role: 'user', content: msgText };
    const newMessages = isInternalAction ? [...messages] : [...messages, userMsg];
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CHAT_REQUEST_TIMEOUT_MS);

    if (!isInternalAction) {
      setMessages(newMessages);
      setInput('');
    }
    setLoading(true);

    try {
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      const accessToken = activeSession?.access_token || session?.access_token;

      if (!accessToken) {
        appendAssistantMessage(setMessages, 'Phiên đăng nhập đã hết hạn hoặc token không hợp lệ. Hãy đăng xuất rồi đăng nhập lại.');
        toast.error('Phiên đăng nhập không hợp lệ.');
        return;
      }

      const invokePromise = supabase.functions.invoke('ai-shift-assistant', {
        body: {
          conversation_id: conversationId,
          messages: [...newMessages, userMsg].map(m => ({ role: m.role, content: m.content })),
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new DOMException('Request timed out', 'AbortError'));
        }, { once: true });
      });

      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

      const status = (error as { context?: { status?: number } } | null)?.context?.status;
      const errorMessage = typeof error?.message === 'string' ? error.message : '';

      if (status === 401) {
        appendAssistantMessage(setMessages, 'Phiên đăng nhập đã hết hạn hoặc token không hợp lệ. Hãy đăng xuất rồi đăng nhập lại.');
        toast.error('Phiên đăng nhập không hợp lệ.');
        return;
      }
      if (status === 403) {
        appendAssistantMessage(setMessages, 'Bạn không có quyền sử dụng Trợ lý AI.');
        toast.error('Bạn không có quyền sử dụng Trợ lý AI.');
        return;
      }
      if (status === 429) {
        appendAssistantMessage(setMessages, 'Hệ thống AI đang bận. Vui lòng thử lại sau ít phút.');
        toast.error('Hệ thống đang bận, vui lòng thử lại sau.');
        return;
      }
      if (status === 402) {
        appendAssistantMessage(setMessages, 'Dịch vụ AI hiện không khả dụng do hết hạn mức cấu hình ở backend.');
        toast.error('Hết hạn mức AI.');
        return;
      }

      if (error) {
        throw new Error(errorMessage);
      }

      const reply = typeof data?.reply === 'string' ? data.reply : '';
      const needsConfirm = canManageShifts && reply.toLowerCase().includes('xác nhận');

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: reply || 'Không nhận được phản hồi từ Trợ lý AI. Hãy kiểm tra log Edge Function.',
          pending_confirmation: needsConfirm,
        },
      ]);

      if (data?.mutations && onDataChanged) onDataChanged();
    } catch (err) {
      console.error('AI Chat error:', err);
      const message = err instanceof Error
        ? err.name === 'AbortError'
          ? 'Chatbot quá thời gian chờ phản hồi. Hãy kiểm tra Edge Function và API OpenAI.'
          : err.message
        : 'Lỗi kết nối với Trợ lý AI';

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Không thể xử lý yêu cầu lúc này.\n\nChi tiết lỗi: ${message}`,
        },
      ]);
      toast.error(message);
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    setMessages(prev => prev.map(m => ({ ...m, pending_confirmation: false })));
    sendMessage(INTERNAL_CONFIRM_MESSAGE);
  };

  const handleCancel = () => {
    setMessages(prev => prev.map(m => ({ ...m, pending_confirmation: false })));
    sendMessage(INTERNAL_CANCEL_MESSAGE);
  };

  const clearChat = () => {
    setMessages([]);
    setConversationId(crypto.randomUUID());
  };

  const hasPendingConfirmation = messages.some(m => m.pending_confirmation);

  const chatContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between py-3 px-4 border-b bg-primary/5 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Trợ lý AI HR</h3>
            <span className="text-[10px] text-muted-foreground">
              {isAdmin ? 'HR · Toàn hệ thống' : 'Quản lý · Theo chi nhánh'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearChat} title="Xóa lịch sử">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
        <div className="p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-6 space-y-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Sparkles className="h-6 w-6 text-primary/50" />
              </div>
              <p className="font-medium text-foreground">Xin chào!</p>
              <p className="text-xs">
                Tôi là Trợ lý AI của HR Cậu Cả.
                <br />
                Hỏi tôi về ca làm, chấm công, đánh giá, nhân sự, chi nhánh.
              </p>
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Gợi ý nhanh</p>
                <div className="flex flex-wrap gap-1.5 justify-center">
                  {quickActions.slice(0, 4).map(q => (
                    <button
                      key={q}
                      className="text-xs bg-muted px-2.5 py-1.5 rounded-full hover:bg-primary/10 hover:text-primary transition-colors text-left"
                      onClick={() => sendMessage(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i}>
              <div className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted rounded-bl-md',
                  )}
                >
                  {m.role === 'assistant' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>table]:text-xs">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : m.content}
                </div>
              </div>

              {m.pending_confirmation && canManageShifts && (
                <div className="flex gap-2 mt-2 ml-1">
                  <Button size="sm" onClick={handleConfirm} className="text-xs gap-1 h-8 bg-primary hover:bg-primary/90">
                    Xác nhận thay đổi
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleCancel} className="text-xs gap-1 h-8">
                    Hủy bỏ
                  </Button>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-muted-foreground">Đang xử lý...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-3 border-t shrink-0">
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); sendMessage(); }}>
          <Input
            ref={inputRef}
            placeholder={hasPendingConfirmation ? 'Vui lòng xác nhận hoặc hủy...' : 'Nhập câu hỏi...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading || hasPendingConfirmation}
            className="text-sm rounded-full"
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || !input.trim() || hasPendingConfirmation}
            className="shrink-0 rounded-full"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 group"
        size="icon"
      >
        <Sparkles className="h-6 w-6 group-hover:scale-110 transition-transform" />
      </Button>
    );
  }

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[92vh] p-0 rounded-t-2xl flex flex-col">
          {chatContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[420px] h-[560px] shadow-2xl rounded-2xl border border-border bg-background flex flex-col overflow-hidden">
      {chatContent}
    </div>
  );
}
