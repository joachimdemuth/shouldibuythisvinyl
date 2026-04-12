import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Should I Buy This Vinyl?",
  description:
    "Photograph the barcode or the front of the sleeve, then see prices and a quick take before you buy.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
