import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunk Pick Fallacy — Official Program",
  description: "Live standings, dynasty power rankings and the commissioner’s weekly recap for the Sunk Pick Fallacy league.",
  robots: { index: false, follow: false }, // public by link, kept out of search engines
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
