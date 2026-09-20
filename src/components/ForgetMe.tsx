"use client";

import { useActionState } from "react";
import { forgetTeamAction } from "@/app/t/[slug]/actions";

/** Shared phone at a tournament desk: let the next person take it over. */
export default function ForgetMe({ slug }: { slug: string }) {
  const [, action, pending] = useActionState(forgetTeamAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <button type="submit" disabled={pending} className="text-zinc-500 underline hover:text-zinc-900 dark:hover:text-zinc-100">
        {pending ? "…" : "not you?"}
      </button>
    </form>
  );
}
