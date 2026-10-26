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
      className={`h-10 inline-flex items-center rounded-md border px-3 text-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 sm:px-4 ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 hover:bg-neutral-100"
      }`}
    >
      {children}
    </Link>
  );
}
