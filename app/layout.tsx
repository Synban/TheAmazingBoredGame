import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Amazing Bored Game",
  description: "Push the button. Everyone sees red.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
