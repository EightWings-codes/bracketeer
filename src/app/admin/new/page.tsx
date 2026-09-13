import { requireAdmin } from "@/lib/admin-guard";
import NewTournamentForm from "./NewTournamentForm";

export default async function NewTournamentPage() {
  await requireAdmin();
  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <h1 className="text-3xl font-bold tracking-tight">New tournament</h1>
      <NewTournamentForm />
    </main>
  );
}
