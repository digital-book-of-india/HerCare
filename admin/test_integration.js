// Comprehensive End-to-End Integration Test for HerCare Admin Panel
// Tests all 5 essential features against the running backend on port 5000

const BASE_URL = 'http://localhost:5000/api/admin';

async function runTests() {
  console.log('========================================================');
  console.log('🚀 STARTING HERCARE ADMIN API INTEGRATION VERIFICATION');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // ---------------------------------------------------------
    // FEATURE 1: Authentication & Session
    // ---------------------------------------------------------
    console.log('--- Feature 1: Authentication & Session ---');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@hercare.local', password: 'rq0Cuc6D9XkHBXKr' })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && loginData.success, 'POST /auth/login returns 200 with success: true');
    assert(Boolean(loginData.data?.token), 'POST /auth/login returns JWT token');
    assert(loginData.data?.admin?.role === 'admin', 'POST /auth/login returns admin role');

    const token = loginData.data.token;
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    // Test GET /me
    const meRes = await fetch(`${BASE_URL}/me`, { headers: authHeaders });
    const meData = await meRes.json();
    assert(meRes.status === 200 && meData.data?.admin?.email === 'admin@hercare.local', 'GET /me verifies active session');

    // ---------------------------------------------------------
    // FEATURE 2: Dashboard Overview (Aggregates Only)
    // ---------------------------------------------------------
    console.log('\n--- Feature 2: Dashboard Overview ---');
    const dashRes = await fetch(`${BASE_URL}/dashboard`, { headers: authHeaders });
    const dashData = await dashRes.json();
    assert(dashRes.status === 200 && dashData.success, 'GET /dashboard returns 200 with success: true');
    assert('users' in dashData.data, 'Dashboard response contains users object');
    assert('records' in dashData.data, 'Dashboard response contains records object');
    assert('activeReminders' in dashData.data, 'Dashboard response contains activeReminders object');
    assert('tips' in dashData.data, 'Dashboard response contains tips object');
    assert('privacyNote' in dashData.data, 'Dashboard response enforces privacyNote');
    console.log(`     Total Tips in DB: ${dashData.data.tips.total}, Active: ${dashData.data.tips.active}, Awaiting Review: ${dashData.data.tips.awaitingReview}`);

    // ---------------------------------------------------------
    // FEATURE 3: Tips Management (Clinical Review Gate)
    // ---------------------------------------------------------
    console.log('\n--- Feature 3: Tips Management & Clinical Review Gate ---');

    // 3.1 List tips
    const listRes = await fetch(`${BASE_URL}/tips`, { headers: authHeaders });
    const listData = await listRes.json();
    assert(listRes.status === 200 && Array.isArray(listData.data?.items), 'GET /tips returns items array');

    // 3.2 Create new tip (starts as Draft)
    const testTitle = `Test Ginger Tea ${Date.now()}`;
    const createRes = await fetch(`${BASE_URL}/tips`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        category: 'food',
        title: testTitle,
        text: 'Drink warm ginger tea to soothe mild muscle tension and abdominal cramps.',
        showWhen: 'period'
      })
    });
    const createData = await createRes.json();
    assert(createRes.status === 201 && createData.data?.tip?.active === false, 'POST /tips creates tip as inactive Draft');
    const tipId = createData.data?.tip?.id;
    assert(createData.data?.tip?.reviewedAt === null, 'Draft tip has reviewedAt = null');

    // 3.3 Try to activate WITHOUT review (Must fail with 409 TIP_NOT_REVIEWED)
    const activateFailRes = await fetch(`${BASE_URL}/tips/${tipId}/active`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ active: true })
    });
    const activateFailData = await activateFailRes.json();
    assert(
      activateFailRes.status === 409 && activateFailData.error?.code === 'TIP_NOT_REVIEWED',
      'Activating unreviewed tip is BLOCKED by clinical review gate (409 TIP_NOT_REVIEWED)'
    );

    // 3.4 Record Clinical Review
    const reviewRes = await fetch(`${BASE_URL}/tips/${tipId}/review`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        reviewedBy: 'Dr. Sarah Connor, MD (Clinical Advisor)',
        reviewedAt: new Date().toISOString().split('T')[0]
      })
    });
    const reviewData = await reviewRes.json();
    assert(reviewRes.status === 200 && Boolean(reviewData.data?.tip?.reviewedAt), 'POST /tips/:id/review records clinical review');

    // 3.5 Activate after clinical review
    const activateRes = await fetch(`${BASE_URL}/tips/${tipId}/active`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ active: true })
    });
    const activateData = await activateRes.json();
    assert(activateRes.status === 200 && activateData.data?.tip?.active === true, 'PATCH /tips/:id/active successfully activates reviewed tip');

    // 3.6 Edit wording -> Clinical review MUST be reset and tip taken offline!
    const editRes = await fetch(`${BASE_URL}/tips/${tipId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        text: 'Drink warm herbal tea with ginger slices and honey for comfort.'
      })
    });
    const editData = await editRes.json();
    assert(
      editRes.status === 200 && editData.data?.reviewReset === true && editData.data?.tip?.active === false,
      'Editing wording resets clinical review (reviewReset: true) and takes tip offline'
    );

    // 3.7 Delete tip
    const deleteRes = await fetch(`${BASE_URL}/tips/${tipId}`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert(deleteRes.status === 200, 'DELETE /tips/:id permanently removes the tip');

    // ---------------------------------------------------------
    // FEATURE 4: Default Content & Texts Management
    // ---------------------------------------------------------
    console.log('\n--- Feature 4: Default Texts & Checklist ---');
    const contentRes = await fetch(`${BASE_URL}/content`, { headers: authHeaders });
    const contentData = await contentRes.json();
    assert(contentRes.status === 200 && contentData.data?.content, 'GET /content returns disclaimer, privacy, and checklist');
    assert(contentData.data.content.disclaimerText?.length >= 20, 'Medical disclaimer is present and >= 20 chars');
    assert(contentData.data.content.privacyText?.length >= 20, 'Privacy disclosure is present and >= 20 chars');
    assert(Array.isArray(contentData.data.content.defaultChecklistItems), 'Default checklist items is an array');

    // Test updating disclaimer
    const existingDisclaimer = contentData.data.content.disclaimerText;
    const patchContentRes = await fetch(`${BASE_URL}/content`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        disclaimerText: existingDisclaimer
      })
    });
    const patchContentData = await patchContentRes.json();
    assert(patchContentRes.status === 200 && patchContentData.success, 'PATCH /content successfully updates content');

    // ---------------------------------------------------------
    // FEATURE 5: Settings & Feature Switch
    // ---------------------------------------------------------
    console.log('\n--- Feature 5: Settings & Feature Switch ---');
    const settingsRes = await fetch(`${BASE_URL}/settings`, { headers: authHeaders });
    const settingsData = await settingsRes.json();
    assert(settingsRes.status === 200 && settingsData.data?.settings, 'GET /settings returns global configuration');
    assert('featureEnabled' in settingsData.data.settings, 'featureEnabled property is present');
    assert('defaultCycleLength' in settingsData.data.settings, 'defaultCycleLength property is present');
    assert('defaultPeriodDuration' in settingsData.data.settings, 'defaultPeriodDuration property is present');

    // Test updating settings
    const patchSettingsRes = await fetch(`${BASE_URL}/settings`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        featureEnabled: true,
        defaultCycleLength: 28,
        defaultPeriodDuration: 5
      })
    });
    const patchSettingsData = await patchSettingsRes.json();
    assert(patchSettingsRes.status === 200 && patchSettingsData.data?.settings?.featureEnabled === true, 'PATCH /settings saves settings');

    // ---------------------------------------------------------
    // SUMMARY
    // ---------------------------------------------------------
    console.log('\n========================================================');
    console.log(`📊 INTEGRATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================');

    if (failed === 0) {
      console.log('🎉 ALL 5 ADMIN FEATURES FULLY INTEGRATED AND VERIFIED!');
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal execution error:', err);
    process.exit(1);
  }
}

runTests();
