import SignInForm from "./SignInForm";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-8 p-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Admin sign in</h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Players don&apos;t need an account — only organisers sign in.
        </p>
      </div>
      <SignInForm />
    </main>
  );
}
