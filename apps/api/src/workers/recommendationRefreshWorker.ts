import { processRecommendationRefreshJob } from '../lib/refreshRecommendations';

export async function recommendationRefreshJob(
  job: Parameters<typeof processRecommendationRefreshJob>[0],
) {
  return processRecommendationRefreshJob(job);
}
