export function absoluteUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString();
}
