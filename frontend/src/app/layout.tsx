import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PlayerProvider } from "@/context/PlayerContext";
import { DownloadProvider } from "@/context/DownloadContext";
import { DownloadManagerDrawer } from "@/components/DownloadManagerDrawer";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { AudioPlayer } from "@/components/AudioPlayer";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "TIDAL | High Fidelity Music Streaming & NAS Engine",
  description: "Bit-Perfect Lossless and Hi-Res FLAC music streaming for Synology NAS and web",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TIDAL",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark bg-black">
      <body className="h-screen w-screen overflow-hidden bg-background text-textPrimary select-none">
        <PlayerProvider>
          <DownloadProvider>
            <div className="flex h-screen w-screen overflow-hidden">
              {/* Desktop Fixed Left Sidebar (240px) */}
              <Sidebar />

              {/* Main Application Window (Scrollable Canvas) */}
              <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-background">
                <Header />
                <main
                  id="main-content"
                  className="flex-1 overflow-y-auto px-4 md:px-8 py-4 pb-36 md:pb-24"
                >
                  {children}
                </main>
              </div>
            </div>

            {/* Mobile Bottom Tab Bar */}
            <MobileBottomNav />

            {/* Audio Player: Desktop Fixed Bar & Mobile Floating Mini-Player + Full-Screen Modal */}
            <AudioPlayer />

            {/* Synology NAS Download Manager Drawer */}
            <DownloadManagerDrawer />

            {/* PWA Service Worker Registration & Notification Sync */}
            <ServiceWorkerRegister />
          </DownloadProvider>
        </PlayerProvider>
      </body>
    </html>
  );
}
