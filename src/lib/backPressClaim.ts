/* ══ BACK-PRESS CLAIM ══
   Problem: multiple independent `popstate` listeners (LiveClassContext's
   class-minimize guard, SubjectMaterialsPanel, ClassMaterialsLivePanel,
   the Quran reader, etc.) all fire on the SAME popstate event — you cannot
   stopPropagation() between separate addEventListener("popstate", ...)
   calls on window, they all run in registration order regardless.

   Fix: a tiny shared "claim" flag. Whichever handler runs FIRST and wants to
   own this specific back-press calls claimBackPress(). Every other handler
   (registered after it, like LiveClassContext's class-minimize handler)
   checks wasBackPressClaimed() and bails out instead of also acting on the
   same press. The flag resets on the next tick so it never leaks into a
   future, unrelated back-press.

   IMPORTANT — registration order: a panel's popstate listener must be
   attached AFTER LiveClassContext's (i.e. the panel mounts later, while
   the call is already active), OR — since DOM event listeners fire in
   *registration* order — the panel must claim early enough in its own
   handler that LiveClassContext's handler (already registered, running
   after it) can still see the claim. Since LiveClassContext registers its
   popstate listener once when state.inCall flips true (at class start,
   i.e. BEFORE any material panel can mount), panel listeners always
   register later and therefore fire later than LiveClassContext's handler
   in the DOM's call order. To make this work regardless of order, every
   consumer (including LiveClassContext) must check the claim FIRST, before
   doing anything else, and panels must claim it INSIDE a capture-phase
   listener so they run before any bubble-phase / later-registered handler.
   We use capture:true here for exactly that reason. */

let claimedAt = 0;

/** Call this first, synchronously, inside a capture-phase popstate handler
 *  to mark this specific back-press as "handled by a panel". */
export function claimBackPress(): void {
  claimedAt = Date.now();
}

/** Returns true if a panel claimed the back-press within the last 50ms
 *  (i.e. this same event cycle). LiveClassContext should call this first
 *  and return early if true, instead of minimizing the whole class. */
export function wasBackPressClaimed(): boolean {
  return Date.now() - claimedAt < 50;
}
