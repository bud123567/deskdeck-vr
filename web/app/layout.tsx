import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "DeskDeck VR · Your spatial workspace",
  description: "Bring your Mac into a private, immersive workspace.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
