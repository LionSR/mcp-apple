#!/usr/bin/env bun

import mailJXA from '../lib/mail.js';

async function testMail() {
  console.log("🧪 Testing Apple Mail JXA Implementation\n");

  try {
    // Test 1: Get accounts
    console.log("1. Getting accounts...");
    const accounts = await mailJXA.getAccounts();
    console.log(`   ✅ Found ${accounts.length} accounts`);
    accounts.forEach(acc => {
      console.log(`      - ${acc.name} (${acc.emailAddresses[0]})`);
    });

    // Test 2: Get mailbox hierarchy
    if (accounts.length > 0) {
      const testAccount = accounts[0];
      console.log(`\n2. Getting mailboxes for ${testAccount.name}...`);
      const hierarchy = await mailJXA.getMailboxHierarchy(testAccount.name);
      console.log(`   ✅ Found ${hierarchy.total} mailboxes`);
      console.log(`      Root folders: ${hierarchy.roots.length}`);
    }

    // Test 3: Search emails
    console.log("\n3. Searching emails...");
    const searchResults = await mailJXA.searchMails("test", 5);
    console.log(`   ✅ Found ${searchResults.length} emails with "test"`);

    // Test 4: Get unread
    console.log("\n4. Getting unread emails...");
    const unread = await mailJXA.getUnreadMails(5);
    console.log(`   ✅ Found ${unread.length} unread emails`);

    console.log("\n✨ All tests passed!");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testMail();