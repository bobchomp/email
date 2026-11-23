import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// No app-wide title: the inbox and email views set "<page> | <account>"
// themselves (src/lib/use-tab-title.ts), and a metadata title here would
// overwrite it once the page loads. Other pages declare their own.
export const metadata: Metadata = {
  description: "Your Gmail, PIN-protected.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
