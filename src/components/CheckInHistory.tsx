import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCheckIn } from '@/contexts/CheckInContext';
import { getSignedImageUrls } from '@/lib/signed-urls';

export function CheckInHistory() {
  const { user } = useAuth();
  const { getCheckInsForUser } = useCheckIn();
  const [signedUrls, setSignedUrls] = useState<Map<string, string>>(new Map());

  const items = user ? getCheckInsForUser(user.id) : [];

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const weekItems = items.filter(ci => new Date(ci.check_in_time) >= startOfWeek);

  useEffect(() => {
    const urls = weekItems.map(ci => ci.image_url).filter(Boolean);
    if (urls.length > 0) {
      getSignedImageUrls(urls).then(setSignedUrls);
    }
  }, [weekItems.length]);

  if (!user) return null;

  if (weekItems.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground py-8">
        Chưa có lần chấm công nào trong tuần này.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
      {weekItems.map(ci => {
        const d = new Date(ci.check_in_time);
        return (
          <div key={ci.id} className="flex flex-col items-center gap-1.5">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden border border-border bg-muted">
              <img src={signedUrls.get(ci.image_url) || ''} alt="Chấm công" className="h-full w-full object-cover" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-foreground">
                {d.toLocaleDateString('vi-VN', { weekday: 'short' })}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
