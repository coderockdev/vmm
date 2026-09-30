import { getDb } from "../db";
import { getSupabase, isSupabaseEnabled, assertNoError } from "../supabaseClient";
import { ContentIdea } from "../types";

/** Edit an idea's text fields (used only by the /channel/[slug] screen). */
export async function updateChannelViewIdea(
  ideaId: string,
  fields: Pick<ContentIdea, "title" | "angle" | "objective">
): Promise<void> {
  if (isSupabaseEnabled()) {
    assertNoError(await getSupabase().from("content_ideas").update(fields).eq("id", ideaId));
    return;
  }
  getDb()
    .prepare(`UPDATE content_ideas SET title = ?, angle = ?, objective = ? WHERE id = ?`)
    .run(fields.title, fields.angle, fields.objective, ideaId);
}
