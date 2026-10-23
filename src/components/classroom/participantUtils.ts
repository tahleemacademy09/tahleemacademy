/**
 * resolveParticipantName — shared helper for ClassroomView and ClassParticipants.
 *
 * LiveKit surfaces the display name in three places depending on the version of
 * the server SDK and how the JWT was crafted:
 *   1. participant.name       — set by the server from the JWT `name` claim
 *   2. participant.metadata   — JSON string; we store { name, role, user_id }
 *   3. participant.identity   — the JWT `sub` claim (usually a UUID)
 *
 * We prefer (1), fall back to (2), and use a shortened UUID as last resort so
 * the UI never shows the raw string "User".
 */
export function resolveParticipantName(participant: {
  name?: string;
  identity?: string;
  metadata?: string;
}): string {
  const { name, identity, metadata } = participant;

  // 1. Explicit name from LiveKit (comes from JWT `name` claim via the server)
  if (name && name !== identity && name.trim()) return name.trim();

  // 2. Fallback: parse our custom metadata JSON
  if (metadata) {
    try {
      const meta = JSON.parse(metadata);
      if (meta?.name && typeof meta.name === "string" && meta.name.trim()) {
        return meta.name.trim();
      }
    } catch { /* ignore malformed metadata */ }
  }

  // 3. Last resort: shorten the UUID identity so it is at least unique
  const id = (identity ?? "").trim();
  if (!id) return "Participant";
  return id.length > 20 ? id.slice(0, 8) + "…" : id;
}
