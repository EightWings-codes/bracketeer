import type { Theme } from "@/lib/themes";
import { inputCls } from "@/components/ui";
import TeamIcon from "@/components/TeamIcon";

/**
 * Point each emblem at your own artwork. Left blank, the drawn emblem is used.
 *
 * The images are loaded by whoever views the page, never by the server, and
 * the organiser filling this in is the one deciding they may use them — which
 * is why this is a field rather than anything we ship pre-filled.
 */
export default function IconArtEditor({ theme, art }: { theme: Theme; art: Record<string, string> }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        Paste an image URL to replace an emblem — a club crest, a sponsor, your own drawing. Leave blank to keep the
        one below. Square images work best; they are cropped to a circle.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {theme.icons.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-xs">
            <TeamIcon theme={theme.id} icon={i.id} art={art} size="md" />
            <span className="w-24 shrink-0 truncate text-zinc-500">{i.label}</span>
            <input
              name={`iconArt.${i.id}`}
              type="url"
              inputMode="url"
              defaultValue={art[i.id] ?? ""}
              placeholder="https://…"
              className={`${inputCls} min-w-0 flex-1`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
