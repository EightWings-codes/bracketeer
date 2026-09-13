import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Header from "@/components/Header";
import { APP } from "@/lib/config";

export const metadata: Metadata = {
  title: APP.name,
  description: APP.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Header />
        {children}
      </body>
    </html>
  );
}
