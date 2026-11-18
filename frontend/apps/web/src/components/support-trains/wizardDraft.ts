// The Start a Support Train wizard's draft, kept for this tab so a refresh or Back doesn't lose it (B7).
// Cleared on publish and on sign-out, so the next person signing in here never sees it.
export const SUPPORT_TRAIN_WIZARD_KEY = 'pantopus.supportTrainWizard.v1';

export function clearSupportTrainWizardDraft(): void {
  try { sessionStorage.removeItem(SUPPORT_TRAIN_WIZARD_KEY); } catch { /* storage blocked */ }
}
