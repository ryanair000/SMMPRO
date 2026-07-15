const DATABASE_NAME = 'smm-pro-drafts';
const DATABASE_VERSION = 1;
const STORE_NAME = 'campaigns';
const ACTIVE_DRAFT_KEY = 'active';
export const LEGACY_DRAFT_STORAGE_KEY = 'smm-pro-campaign-draft';
export const CAMPAIGN_DRAFT_VERSION = 2;

function openDraftDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open draft storage.'));
  });
}

async function runDraftRequest(mode, operation) {
  const database = await openDraftDatabase();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Draft storage request failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Draft storage transaction was cancelled.'));
    });
  } finally {
    database.close();
  }
}

export function createCampaignDraft({
  accountId,
  publishFacebook,
  publishInstagram,
  publishMode,
  scheduleTime,
  spreadInterval,
  recurrenceFrequency,
  recurrenceCount,
  queue
}) {
  return {
    version: CAMPAIGN_DRAFT_VERSION,
    updatedAt: new Date().toISOString(),
    accountId,
    publishFacebook,
    publishInstagram,
    publishMode,
    scheduleTime,
    spreadInterval,
    recurrenceFrequency,
    recurrenceCount,
    items: queue.map(item => ({
      name: item.file?.name || item.name || 'Campaign image',
      file: item.file || null,
      caption: item.caption || '',
      imageUrl: item.imageUrl?.trim() || ''
    }))
  };
}

function createLocalStorageFallback(draft) {
  return {
    ...draft,
    items: draft.items.map(({ file, ...item }) => ({
      ...item,
      needsFile: Boolean(file) && !item.imageUrl
    }))
  };
}

export async function loadCampaignDraft() {
  try {
    const storedDraft = await runDraftRequest('readonly', store => store.get(ACTIVE_DRAFT_KEY));
    if (storedDraft) return storedDraft;
  } catch {
    // Fall through to the lightweight localStorage copy.
  }

  const fallback = localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY);
  return fallback ? JSON.parse(fallback) : null;
}

export async function saveCampaignDraft(draft) {
  let includesFiles = false;

  try {
    await runDraftRequest('readwrite', store => store.put(draft, ACTIVE_DRAFT_KEY));
    includesFiles = true;
  } catch {
    // Keep a metadata-only copy below when IndexedDB is unavailable.
  }

  try {
    localStorage.setItem(LEGACY_DRAFT_STORAGE_KEY, JSON.stringify(createLocalStorageFallback(draft)));
  } catch {
    if (!includesFiles) throw new Error('No browser draft storage is available.');
  }

  return { includesFiles };
}

export async function deleteCampaignDraft() {
  try {
    localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
  } catch {
    // IndexedDB can still be cleared when localStorage is unavailable.
  }

  try {
    await runDraftRequest('readwrite', store => store.delete(ACTIVE_DRAFT_KEY));
  } catch {
    // localStorage has still been cleared when IndexedDB is unavailable.
  }
}
