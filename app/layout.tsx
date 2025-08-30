import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Start MediaMTX when the app starts (in production)
if (process.env.NODE_ENV === 'production') {
  import('@/lib/mediamtx');
}

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Nostr Stream Bridge",
  description: "Mirror YouTube/Twitch streams to Nostr with Lightning zaps",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}