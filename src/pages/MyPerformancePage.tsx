import { MyPerformance } from '@/components/MyPerformance';

export default function MyPerformancePage() {
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Hiệu suất của tôi</h2>
        <p className="text-sm text-muted-foreground mt-1">Xem điểm đánh giá và lịch sử hiệu suất</p>
      </div>
      <MyPerformance />
    </div>
  );
}
