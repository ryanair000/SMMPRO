import assert from 'node:assert/strict';
import test from 'node:test';
import { getAccountCredentials } from '../src/lib/socialAccounts.js';

function withEnv(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('uses the Page token for Instagram publishing with Facebook Login', () => {
  withEnv({
    JENGASITES_FB_PAGE_ACCESS_TOKEN: 'page-token',
    JENGASITES_FB_USER_ACCESS_TOKEN: 'user-token',
    JENGASITES_FB_PAGE_ID: 'page-id',
    JENGASITES_IG_USER_ID: 'ig-id'
  }, () => {
    const { credentials } = getAccountCredentials('jengasites');

    assert.equal(credentials.pageToken, 'page-token');
    assert.equal(credentials.instagramAccessToken, 'page-token');
    assert.equal(credentials.userToken, 'page-token');
    assert.equal(credentials.metaUserToken, 'user-token');
  });
});

test('does not publish Instagram content with a user token when the Page token is missing', () => {
  withEnv({
    JENGASITES_FB_PAGE_ACCESS_TOKEN: undefined,
    JENGASITES_FB_USER_ACCESS_TOKEN: 'user-token'
  }, () => {
    const { credentials } = getAccountCredentials('jengasites');

    assert.equal(credentials.instagramAccessToken, undefined);
    assert.equal(credentials.userToken, undefined);
    assert.equal(credentials.metaUserToken, 'user-token');
  });
});
