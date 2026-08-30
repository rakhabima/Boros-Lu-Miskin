"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children
}: {
  href: string;
  children: React.ReactNode;
}) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      className={`h-10 inline-flex items-center rounded-md border px-4 text-sm ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300"
      }`}
    >
      {children}
    </Link>
  );
}
