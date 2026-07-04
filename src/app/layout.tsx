import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Girişim Atlası | Ekosistem Fırsatları",
  description:
    "Türkiye ve dünyadan fon, destek programı, hızlandırıcı ve girişimcilik fırsatları.",
};

const themeScript = `
  (function () {
    try {
      var savedTheme = window.localStorage.getItem("atlas-theme");
      document.documentElement.dataset.theme =
        savedTheme === "dark" ? "dark" : "light";
    } catch (_) {
      document.documentElement.dataset.theme = "light";
    }
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
