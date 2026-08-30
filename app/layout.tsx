import type { Metadata } from "next";
import { APP_NAME } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Expense tracker"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: browser extensions (one sec, password managers,
    // dark-mode tools) inject attributes onto <html> before React hydrates, which
    // React reports as a mismatch. The server output is clean — verified — so this
    // is the extension, not our markup. It only suppresses warnings for THIS
    // element's own attributes, one level deep, so genuine mismatches inside the
    // app are still reported.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        {children}
      </body>
    </html>
  );
}
