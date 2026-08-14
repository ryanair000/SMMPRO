import {
  claimDueScheduledPublishes,
  completeScheduledPublish,
  failScheduledPublish
} from '@/lib/scheduledPublishes';
import {
  publishScheduledFacebookPost,
  publishScheduledInstagramPost
} from '@/lib/scheduledMetaPublisher';
import { getResolvedMetaCredentials } from '@/lib/meta';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

async function processJob(job) {
  try {
    const { credentials } = await getResolvedMetaCredentials(job.account_id);
    let result;

    if (job.platform === 'facebook') {
      if (!credentials.pageId || !credentials.pageToken) {
        throw new Error('Facebook publishing credentials are not configured.');
      }
      result = await publishScheduledFacebookPost({
        pageId: credentials.pageId,
        accessToken: credentials.pageToken,
        message: job.message,
        imageUrl: job.image_url
      });
    } else {
      // Instagram API with Facebook Login publishes with the Page access token.
      const accessToken = credentials.instagramAccessToken || credentials.pageToken;
      if (!credentials.igUserId || !accessToken) {
        throw new Error('Instagram publishing credentials are not configured.');
      }
      if (!job.image_url) {
        throw new Error('Instagram scheduled publishing requires a public image URL.');
      }
      result = await publishScheduledInstagramPost({
        igUserId: credentials.igUserId,
        accessToken,
        message: job.message,
        imageUrl: job.image_url,
        publishMode: job.publish_mode
      });
    }

    await completeScheduledPublish(job.job_id, result);
    return { jobId: job.job_id, status: 'succeeded' };
  } catch (error) {
    await failScheduledPublish(job.job_id, error);
    return {
      jobId: job.job_id,
      status: 'retry_or_failed',
      error: error instanceof Error ? error.message : 'Publishing failed.'
    };
  }
}

export async function GET(request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return Response.json({ error: 'CRON_SECRET is not configured.' }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobs = await claimDueScheduledPublishes(20);
  const results = await Promise.all(jobs.map(processJob));
  return Response.json({ ok: true, claimed: jobs.length, results });
}
