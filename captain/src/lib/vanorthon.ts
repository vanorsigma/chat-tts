export const VANORTHON_DEFAULT_URL = 'https://vanorthon.catmaid.dev';

export type VanorthonMilestone = {
  title: string;
  cumulativeWeight: number;
  progress: number;
};

export type VanorthonData = {
  siteUrl: string;
  rates: { subsUnitValue: number; bitsUnitValue: number };
  achievedWeight: number;
  milestones: VanorthonMilestone[];
};

export type MilestoneProgress = {
  next: { title: string; earned: number; goal: number; percent: number } | null;
  achievedCount: number;
};

// make the bar span only previous and next milestone
export function milestoneProgressOf(
  data: Pick<VanorthonData, 'achievedWeight' | 'milestones'>
): MilestoneProgress {
  const index = data.milestones.findIndex((milestone, position) => {
    const previous = position > 0 ? data.milestones[position - 1].cumulativeWeight : 0;
    return milestone.progress < 1 && milestone.cumulativeWeight > previous;
  });
  const achievedCount = data.milestones.filter((milestone) => milestone.progress >= 1).length;
  if (index < 0) return { next: null, achievedCount };

  const next = data.milestones[index];
  const previous = index > 0 ? data.milestones[index - 1].cumulativeWeight : 0;
  const goal = next.cumulativeWeight - previous;
  const earned = Math.min(goal, Math.max(0, data.achievedWeight - previous));

  return {
    next: {
      title: next.title,
      earned,
      goal,
      percent: (earned / goal) * 100
    },
    achievedCount
  };
}
