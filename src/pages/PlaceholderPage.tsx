import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">This module will be implemented in Phase 2.</p>
        </CardContent>
      </Card>
    </div>
  );
}
