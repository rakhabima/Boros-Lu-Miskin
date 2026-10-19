import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { APP_LOGO, APP_NAME, SHORTCUT_NAME } from "@/lib/branding";

// Opened on the iPhone (by the Shortcut when it has no token yet, or by hand).
export default async function ConnectPage() {
  const user = await getSession();
  if (!user) redirect("/login?next=/connect");

  return (
    <div className="min-h-screen flex items-center">
      <div className="max-w-md mx-auto px-6 w-full rounded-xl border border-neutral-200 bg-white p-6">
        <h1 className="text-xl font-semibold mb-2">
          {APP_LOGO} {APP_NAME}
        </h1>
        <p className="text-sm text-neutral-600 mb-6">
          Signed in as {user.name}. This opens the “{SHORTCUT_NAME}” Shortcut and
          links it to your account. The link works once and expires in 5 minutes.
        </p>
        <form method="post" action="/api/connect/approve">
          <button className="h-11 w-full rounded-md bg-neutral-900 text-sm font-medium text-white">
            Connect this iPhone to your account
          </button>
        </form>
      </div>
    </div>
  );
}
