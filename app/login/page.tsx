import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { safeNext } from "@/lib/validation";
import { AuthCard } from "@/components/AuthCard";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next: rawNext } = await searchParams;
  const next = safeNext(rawNext);
  if (await getSession()) redirect(next);

  return (
    <div className="min-h-screen flex items-center">
      <div className="max-w-3xl mx-auto px-6 w-full">
        <AuthCard next={next} />
        {error === "oauth" && (
          <p className="mt-4 text-sm text-red-600" role="alert">
            Google sign-in failed. Please try again.
          </p>
        )}
      </div>
    </div>
  );
}
