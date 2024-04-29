export interface BaseAIOnboardingDialogProps {
  onDismiss: () => void;
}
export enum AIOnboardingType {
  GENERAL = 'dismissAiOnboarding',
  EDGELESS = 'dismissAiOnboardingEdgeless',
  LOCAL = 'dismissAiOnboardingLocal',
}
