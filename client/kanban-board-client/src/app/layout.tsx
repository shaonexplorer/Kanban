import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { OverlayStateProvider } from "@/features/board/overlays/useOverlayState";

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
        <Providers>
          {/* Phase 5 Step 5 — Lifted overlay state (Plan §5.4).
           * Owned at the app root so the home page's empty-state
           * card and the board view's control bar can open the
           * same `CreateBoardDrawer` without prop-drilling. The
           * `selectedTaskId` field is also owned here so a card
           * click anywhere on the board (or compact mode) opens
           * the same `TaskModal`. */}
          <OverlayStateProvider>{children}</OverlayStateProvider>
        </Providers>
      </body>
    </html>
  );
}
