import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sunk Pick Fallacy — The Weekly / Week 01",
  description: "The draft is over. The bullshit isn’t. Week 1 matchups, draft receipts, and the commissioner’s weekly roast.",
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
