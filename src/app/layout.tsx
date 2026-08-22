import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppDataProvider } from "@/lib/app-data";
import Sidebar from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Klassekart",
  description: "Enkelt verktøy for å generere klassekart og holde oversikt over elever.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="no"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full">
        <AppDataProvider>
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">{children}</main>
        </AppDataProvider>
      </body>
    </html>
  );
}
