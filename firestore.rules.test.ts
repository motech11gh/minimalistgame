import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesContent = fs.readFileSync(
  fs.existsSync('./firestore.rules') ? './firestore.rules' : './DRAFT_firestore.rules',
  'utf8'
);

test('Firestore Rules: Dirty Dozen & Eight Pillars Static Verification', () => {
  // 1. Default-deny catch-all at top
  assert.match(rulesContent, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);

  // 2. Verified email guard on writes
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);

  // 3. Path Variable Hardening (isValidId)
  assert.match(rulesContent, /function isValidId\(id\)/);
  assert.match(rulesContent, /id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);

  // 4. OperatorProfile Validation Blueprint
  assert.match(rulesContent, /function isValidOperatorProfile\(data\)/);
  assert.match(rulesContent, /data\.keys\(\)\.hasAll\(/);
  assert.match(rulesContent, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rulesContent, /data\.uid == request\.auth\.uid/);

  // 5. Action-based update with affectedKeys().hasOnly() & immutability
  assert.match(rulesContent, /incoming\(\)\.uid == existing\(\)\.uid/);
  assert.match(rulesContent, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
  assert.match(rulesContent, /incoming\(\)\.updatedAt == request\.time/);
  assert.match(rulesContent, /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly/);

  // 6. Relational parent check on MatchRecord create & immutability lock
  assert.match(
    rulesContent,
    /exists\(\/databases\/\$\(database\)\/documents\/operators\/\$\(request\.auth\.uid\)\)/
  );
  assert.match(rulesContent, /allow update, delete: if false;/);

  // 7. Query Enforcer on allow list (no blanket isSignedIn() list)
  assert.match(rulesContent, /allow list: if isSignedIn\(\) && resource\.data\.uid == request\.auth\.uid;/);
});
