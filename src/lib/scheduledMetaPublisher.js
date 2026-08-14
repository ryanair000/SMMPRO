function graphUrl(path) {
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v20.0';
  return `https://graph.facebook.com/${version}/${path.replace(/^\//, '')}`;
}

async function readGraphResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: text || response.statusText || 'Unknown Meta response' } };
  }
}

async function postToMeta(endpoint, formData, target) {
  const response = await fetch(endpoint, { method: 'POST', body: formData });
  const data = await readGraphResponse(response);
  if (!response.ok || data.error) {
    const error = new Error(
      `${target} Error: ${data.error?.message || `HTTP ${response.status}`}`
    );
    error.details = {
      code: data.error?.code,
      type: data.error?.type,
      status: response.status
    };
    throw error;
  }
  return data;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForInstagramContainer(creationId, accessToken) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const url = new URL(graphUrl(`/${creationId}`));
    url.searchParams.set('fields', 'status_code,status');
    url.searchParams.set('access_token', accessToken);
    const response = await fetch(url, { cache: 'no-store' });
    const data = await readGraphResponse(response);

    if (!response.ok || data.error) {
      throw new Error(
        `Instagram Error: ${data.error?.message || 'container status request failed'}`
      );
    }
    if (data.status_code === 'FINISHED') return;
    if (['ERROR', 'EXPIRED'].includes(data.status_code)) {
      throw new Error(`Instagram Error: media container ${data.status_code.toLowerCase()}`);
    }
    await sleep(2500);
  }
  throw new Error('Instagram Error: media container was not ready before timeout');
}

export async function publishScheduledFacebookPost({
  pageId,
  accessToken,
  message,
  imageUrl
}) {
  const endpoint = imageUrl
    ? graphUrl(`/${pageId}/photos`)
    : graphUrl(`/${pageId}/feed`);
  const formData = new FormData();
  if (message) formData.append('message', message);
  if (imageUrl) formData.append('url', imageUrl);
  formData.append('access_token', accessToken);
  return postToMeta(endpoint, formData, 'Facebook Page');
}

export async function publishScheduledInstagramPost({
  igUserId,
  accessToken,
  message,
  imageUrl,
  publishMode
}) {
  const createForm = new FormData();
  if (publishMode === 'story') createForm.append('media_type', 'STORIES');
  createForm.append('image_url', imageUrl);
  if (message && publishMode !== 'story') createForm.append('caption', message);
  createForm.append('access_token', accessToken);

  const target = publishMode === 'story' ? 'Instagram Story' : 'Instagram';
  const created = await postToMeta(
    graphUrl(`/${igUserId}/media`),
    createForm,
    target
  );
  await waitForInstagramContainer(created.id, accessToken);

  const publishForm = new FormData();
  publishForm.append('creation_id', created.id);
  publishForm.append('access_token', accessToken);
  const published = await postToMeta(
    graphUrl(`/${igUserId}/media_publish`),
    publishForm,
    target
  );

  return { ...published, containerId: created.id };
}
