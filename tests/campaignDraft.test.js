import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN_DRAFT_VERSION, createCampaignDraft } from '../src/lib/campaignDraft.js';

test('creates a durable campaign snapshot without object URLs or transient statuses', () => {
  const file = { name: 'poster.png' };
  const draft = createCampaignDraft({
    accountId: 'jengasites',
    publishFacebook: false,
    publishInstagram: true,
    publishMode: 'individual',
    scheduleTime: '',
    spreadInterval: 2,
    recurrenceFrequency: 'none',
    recurrenceCount: 7,
    queue: [{
      id: 'temporary-id',
      file,
      objectUrl: 'blob:temporary-preview',
      caption: 'A saved caption',
      imageUrl: ' https://cdn.example/poster.png ',
      status: 'generating'
    }]
  });

  assert.equal(draft.version, CAMPAIGN_DRAFT_VERSION);
  assert.equal(draft.accountId, 'jengasites');
  assert.deepEqual(draft.items, [{
    name: 'poster.png',
    file,
    caption: 'A saved caption',
    imageUrl: 'https://cdn.example/poster.png'
  }]);
  assert.equal('objectUrl' in draft.items[0], false);
  assert.equal('status' in draft.items[0], false);
});
