export type RiskWeights = {
  critical: number;
  high: number;
  medium: number;
  low: number;
};

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  critical: 10,
  high: 6,
  medium: 3,
  low: 1,
};
