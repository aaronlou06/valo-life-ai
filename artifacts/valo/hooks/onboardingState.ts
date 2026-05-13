// Module-level flag so the tabs layout doesn't re-check after onboarding completes
// within the same session.
let _onboardingComplete = false;

export function isOnboardingComplete(): boolean {
  return _onboardingComplete;
}

export function markOnboardingComplete(): void {
  _onboardingComplete = true;
}
