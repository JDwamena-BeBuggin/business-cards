import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Card Flow — Business Card Workflow",
  description: "Capture business cards, extract contacts, and export to Excel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
