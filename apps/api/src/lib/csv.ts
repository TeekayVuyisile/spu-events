/**
 * Builds RFC 4180 CSV. Cells that a spreadsheet would run as a formula
 * (starting with = + - @ or a tab/CR) are prefixed with ' to defuse CSV injection.
 */
export function toCsv(header: string[], rows: (string | number | null)[][]) {
  const cell = (value: string | number | null) => {
    if (value === null) return '';
    if (typeof value === 'number') return String(value);
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
