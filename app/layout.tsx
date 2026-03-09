import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Should I Buy This Vinyl?",
  description:
    "Upload a vinyl cover and get a Discogs-informed buy recommendation.",
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
