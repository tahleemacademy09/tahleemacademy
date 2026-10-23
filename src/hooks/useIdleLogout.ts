/**
 * useIdleLogout — DISABLED: idle auto-logout is turned off.
 * Users remain logged in indefinitely until they explicitly sign out.
 * The session persists across browser closes/reopens via localStorage
 * (handled by Supabase with persistSession: true + autoRefreshToken: true).
 *
 * The hook still exports the same shape so all call-sites compile unchanged.
 * showWarn is always false, so IdleWarningModal never renders.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useIdleLogout(_inCall = false) {
  return {
    showWarn: false,
    countdown: 0,
    stayLoggedIn: () => {},
  };
}
