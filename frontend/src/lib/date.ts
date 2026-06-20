export function parseLocalDate(dateValue: string) {
  const datePart = dateValue.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
}

