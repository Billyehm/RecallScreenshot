import type { SearchHit } from "../../search/domain/searchResult";

/**
 * One turn in the ask-your-library conversation.
 *
 * An answer carries the hits it was built from rather than a rendered description of them, so the
 * transcript can show the actual images and stay in step with what the index returned.
 */
export type ConversationMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
  hits?: SearchHit[];
  choices?: Array<{ label: string; query: string }>;
};

const SPELLING: Record<string, string> = {
  recieve: "receive", reciept: "receipt", screeshot: "screenshot", screnshot: "screenshot",
  mesage: "message", whatsap: "WhatsApp", instgram: "Instagram", tikect: "ticket",
  adress: "address", calender: "calendar", resturant: "restaurant", bussiness: "business",
  imgae: "image", iamge: "image", phot: "photo", eror: "error"
};

/** Conservative on-device cleanup: only asks when it can show a genuinely different query. */
export function suggestQueryCorrection(raw: string): string | undefined {
  let changed = false;
  const words = raw.trim().split(/\s+/).map((word) => {
    const bare = word.toLowerCase().replace(/[^a-z]/g, "");
    const corrected = SPELLING[bare];
    if (!corrected) return word;
    changed = true;
    return corrected;
  });
  let result = words.join(" ")
    .replace(/\b(i)\b/g, "I")
    .replace(/\b(images|photos|screenshots) has\b/gi, "$1 have")
    .replace(/\b(image|photo|screenshot) have\b/gi, "$1 has")
    .replace(/\b(\w+)\s+\1\b/gi, "$1");
  if (result !== words.join(" ")) changed = true;
  result = result.trim();
  return changed && result.toLowerCase() !== raw.trim().toLowerCase() ? result : undefined;
}

/** Phrasing for what the on-device search came back with. Plain counts, no invented confidence. */
export function describeAnswer(query: string, hits: SearchHit[]): string {
  if (!hits.length) {
    return `Nothing in your library matches "${query}" yet. Try describing what the image shows or the words on it — Recall searches recognized text, objects and categories.`;
  }

  const categories = [...new Set(hits.map((hit) => hit.screenshot.category).filter(Boolean))];
  const scope = categories.length === 1 ? ` All of them are in ${categories[0]}.` : "";
  return `Found ${hits.length} image${hits.length === 1 ? "" : "s"} for "${query}", best match first.${scope}`;
}
