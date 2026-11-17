// Mic "tail" — keeps the microphone open briefly after the user presses Mute.
//
// ROOT CAUSE of "I said a word, muted, and nobody heard the last word":
// pressing Mute disables the track and signals the server immediately. The last
// ~300-500 ms of speech is still inside the audio encoder / network / the other
// side's jitter buffer at that moment, and the server stops forwarding as soon as
// it receives the mute, so that tail is dropped. Waiting a little before actually
// muting lets the final word reach everyone. The button/UI flips instantly.
export const MIC_TAIL_MS = 700;

/** Await this BEFORE calling setMicrophoneEnabled(false). No-op when turning the mic on. */
export const micTail = (room: any, nextEnabled: boolean): Promise<void> => {
  if (nextEnabled) return Promise.resolve();
  try { if (!room?.localParticipant?.isMicrophoneEnabled) return Promise.resolve(); } catch {}
  return new Promise((resolve) => setTimeout(resolve, MIC_TAIL_MS));
};
