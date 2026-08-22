import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";

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
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border bg-surface-raised">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/laererliv-logo.png"
                alt="Lærerliv"
                width={32}
                height={32}
                className="rounded-md"
              />
              <span className="text-lg font-semibold tracking-tight">Klassekart</span>
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="border-t border-border py-4 text-center text-xs text-subtle">
          Klassekart &mdash; enkel elevplassering for lærere
        </footer>
      </body>
    </html>
  );
}
