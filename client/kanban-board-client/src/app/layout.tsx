import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mini Kanban Board",
  description: "A collaborative Kanban board for organizing tasks and tracking progress.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      // Kinetic Grid is a dark-mode-only design system — see
      // design/design.md §Colors ("deep slate grounds") and §Layer 0
      // ("Pure #0B0F19. Zero shadow."). Hard-pin the dark class so the
      // tokens.css color vars resolve correctly on every render.
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
