export const DEGREE_DAY_MODELS = {
  NOW: {
    label: 'Navel Orangeworm',
    lowerThresholdF: 55,
    upperThresholdF: 94,
    biofixMonth: 3,
    actionThresholdDd: 1350,
    applicableCrops: ['almond', 'navel_orange', 'valencia_orange'] as const,
  },
  PTB: {
    label: 'Peach Twig Borer',
    lowerThresholdF: 50,
    upperThresholdF: 88,
    biofixMonth: 2,
    actionThresholdDd: 260,
    applicableCrops: ['almond'] as const,
  },
} as const;

export type DegreeDayModelKey = keyof typeof DEGREE_DAY_MODELS;
