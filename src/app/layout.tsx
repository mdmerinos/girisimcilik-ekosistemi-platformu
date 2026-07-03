import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Girişim Atlası | Ekosistem Fırsatları",
  description:
    "Türkiye ve dünyadan fon, destek programı, hızlandırıcı ve girişimcilik fırsatları.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
