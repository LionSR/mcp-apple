#!/usr/bin/env bun

import mailJXA from '../lib/mail.js';

async function testSearch() {
  console.log("🔍 Testing Apple Mail Search Functions\n");

  try {
    // Test 1: Basic search (priority mailboxes only)
    console.log("1. Testing basic search (priority mailboxes)...");
    console.time("   Time");
    const basicResults = await mailJXA.searchMails("quantum", 10);
    console.timeEnd("   Time");
    console.log(`   ✅ Found ${basicResults.length} emails`);
    if (basicResults.length > 0) {
      console.log(`   First result: "${basicResults[0].subject}"`);
    }

    // Test 2: Inbox search
    console.log("\n2. Testing inbox search...");
    console.time("   Time");
    const inboxResults = await mailJXA.searchInbox("quantum", 10);
    console.timeEnd("   Time");
    console.log(`   ✅ Found ${inboxResults.length} emails in inbox`);
    if (inboxResults.length > 0) {
      console.log(`   First result: "${inboxResults[0].subject}"`);
    }

    // Test 3: Specific mailbox search
    console.log("\n3. Testing specific mailbox search...");
    console.time("   Time");
    const mailboxResults = await mailJXA.searchInMailbox("INBOX", "quantum", undefined, 10);
    console.timeEnd("   Time");
    console.log(`   ✅ Found ${mailboxResults.length} emails in INBOX`);
    if (mailboxResults.length > 0) {
      console.log(`   First result: "${mailboxResults[0].subject}"`);
    }

    // Test 4: Search in specific account's mailbox
    const accounts = await mailJXA.getAccounts();
    if (accounts.length > 0) {
      const firstAccount = accounts[0];
      console.log(`\n4. Testing mailbox search in ${firstAccount.name}...`);
      console.time("   Time");
      const accountMailboxResults = await mailJXA.searchInMailbox(
        "INBOX",
        "test",
        firstAccount.name,
        5
      );
      console.timeEnd("   Time");
      console.log(`   ✅ Found ${accountMailboxResults.length} emails in ${firstAccount.name}/INBOX`);
    }

    console.log("\n✨ All search tests completed!");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testSearch();