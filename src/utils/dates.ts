export function addInterval(date: Date, interval: string): Date {
  const d = new Date(date);
  if (interval === "annual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // monthly and custom default to monthly
  return d;
}
