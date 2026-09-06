export interface AccountQuotaView {
  email: string;
  /** Null when no reading could be obtained for the account. */
  remainingPercentage: number | null;
}

export const DEFAULT_SWITCH_THRESHOLD = 15;

function readable(views: readonly AccountQuotaView[]): AccountQuotaView[] {
  return views.filter((view) => view.remainingPercentage !== null);
}

/**
 * Picks the account with the most quota left.
 *
 * Accounts with no reading are never chosen: switching to one because it
 * "might" have room is how an agent ends up on an exhausted account.
 */
export function chooseBestAccount(
  views: readonly AccountQuotaView[],
  minimumPercentage?: number
): AccountQuotaView | null {
  const candidates = readable(views).filter(
    (view) =>
      minimumPercentage === undefined || (view.remainingPercentage ?? 0) >= minimumPercentage
  );
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((best, view) =>
    (view.remainingPercentage ?? 0) > (best.remainingPercentage ?? 0) ? view : best
  );
}

export type AutoSwitchOutcome =
  | { switched: false; reason: string; stuck: boolean; from: string | null }
  | { switched: true; reason: string; from: string | null; to: string };

/**
 * Decides whether a shell should move to a different account.
 *
 * `stuck` distinguishes "you are fine where you are" from "you are low and
 * there is nowhere better to go", which is the state an unattended caller
 * needs to escalate on.
 */
export function decideAutoSwitch(
  current: string | null,
  views: readonly AccountQuotaView[],
  threshold: number
): AutoSwitchOutcome {
  const best = chooseBestAccount(views);
  if (best === null) {
    return {
      switched: false,
      reason: 'No account has a usable quota reading.',
      stuck: true,
      from: current,
    };
  }

  if (current === null) {
    return {
      switched: true,
      reason: 'No account bound to this shell.',
      from: null,
      to: best.email,
    };
  }

  const currentView = views.find((view) => view.email === current);
  const currentRemaining = currentView?.remainingPercentage ?? null;

  if (currentRemaining === null) {
    return {
      switched: true,
      reason: `No quota reading for ${current}.`,
      from: current,
      to: best.email,
    };
  }
  if (currentRemaining >= threshold) {
    return {
      switched: false,
      reason: `${current} is at ${currentRemaining}%, at or above the ${threshold}% threshold.`,
      stuck: false,
      from: current,
    };
  }
  if (best.email === current || (best.remainingPercentage ?? 0) <= currentRemaining) {
    return {
      switched: false,
      reason: `${current} is at ${currentRemaining}% and no other account has more.`,
      stuck: true,
      from: current,
    };
  }

  return {
    switched: true,
    reason: `${current} is at ${currentRemaining}%, below the ${threshold}% threshold.`,
    from: current,
    to: best.email,
  };
}
