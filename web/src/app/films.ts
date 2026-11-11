// The two videos about this site. Addresses, titles and running times are the
// published ones (the "Reader websites" entry of the outreach catalogue); the
// stills are the videos' own, copied to public/films so no page asks another host.

export interface Film {
  id: string;
  title: string;
  about: string;
  youtube: string;
  seconds: number;
  still: string;
}

const still = (name: string) => `${import.meta.env.BASE_URL}films/${name}`;

export const SHORT_FILM: Film = {
  id: "short",
  title: "Proof Reader in a minute and a half",
  about: "One sentence of this paper and the five lines of Lean linked to it.",
  youtube: "https://www.youtube.com/watch?v=gwNR6Lyst2M",
  seconds: 90,
  still: still("proof-reader-short.webp"),
};

export const LONG_FILM: Film = {
  id: "long",
  title: "Three reader websites compared",
  about: "Lean Exposition, Quartic Reader and Proof Reader, and which parts of each come from Lean.",
  youtube: "https://www.youtube.com/watch?v=i5GdVgC-cw0",
  seconds: 298,
  still: still("three-readers-long.webp"),
};

export const clockTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function spokenTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const m = minutes ? `${minutes} minute${minutes === 1 ? "" : "s"}` : "";
  const s = rest ? `${rest} second${rest === 1 ? "" : "s"}` : "";
  return [m, s].filter(Boolean).join(" ");
}
