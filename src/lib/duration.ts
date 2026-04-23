export function formatMinutesAsHours(minutes: number | null | undefined) {
  const totalMinutes = Math.max(0, Math.floor(minutes ?? 0));
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} phút`;
  }

  if (remainingMinutes === 0) {
    return `${hours} giờ`;
  }

  return `${hours} giờ ${remainingMinutes} phút`;
}
