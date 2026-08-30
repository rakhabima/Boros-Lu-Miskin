import { requireUser } from "@/lib/session";
import { signOut } from "@/actions/auth";
import { APP_LOGO, APP_NAME } from "@/lib/branding";
import { NavLink } from "@/components/NavLink";

export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <span role="img" aria-label="Money with wings">
                {APP_LOGO}
              </span>
              {APP_NAME}
            </h1>
            <p className="text-sm text-neutral-600">Signed in as {user.name}</p>
          </div>
          <div className="flex gap-2">
            <NavLink href="/">Expenses</NavLink>
            <NavLink href="/insights">Get Insights with AI</NavLink>
            <form action={signOut}>
              <button
                type="submit"
                className="h-10 rounded-md border border-neutral-300 px-4 text-sm"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
