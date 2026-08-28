import type { TuiViewModel } from '../types';

export interface PlanReviewProps {
  readonly viewModel: TuiViewModel;
}

export function PlanReview({ viewModel }: PlanReviewProps): React.ReactNode {
  const plan = viewModel.plan;
  return (
    <box style={{ flexDirection: 'column', gap: 1 }}>
      <text fg="#ebcb8b">Plan review</text>
      {plan === undefined ? (
        <text>No reviewed plan is selected.</text>
      ) : (
        <>
          <text>{`Action: ${plan.action}`}</text>
          <text>{`Reviewed plan: ${plan.reviewedPlanId}`}</text>
          <text>{`Confirmation required: ${plan.confirmation}`}</text>
        </>
      )}
    </box>
  );
}
