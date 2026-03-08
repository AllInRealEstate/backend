// test-meta-leads.js
// Run this script to send 5 test leads with 30-second delays between each

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = 'http://localhost:5000/api/meta-leads/webhook';
const DELAY_SECONDS = 30;

// Lead files in order
const leadFiles = [
  'lead_1_facebook.json',
  'lead_2_instagram.json',
  'lead_3_facebook.json',
  'lead_4_instagram.json',
  'lead_5_instagram.json'
];

// Sleep function
const sleep = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

// Send a single lead
async function sendLead(filename, index) {
  try {
    const filePath = path.join(__dirname, filename);
    const leadData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📤 Sending Lead ${index + 1}/5: ${filename}`);
    console.log(`   Page ID: ${leadData.entry[0].changes[0].value.page_id}`);
    console.log(`   Lead ID: ${leadData.entry[0].changes[0].value.leadgen_id}`);
    console.log(`${'='.repeat(60)}`);
    
    const response = await axios.post(BACKEND_URL, leadData, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log(`✅ Lead ${index + 1} sent successfully!`);
    console.log(`   Response: ${response.data}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Failed to send lead ${index + 1}:`, error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    }
    return false;
  }
}

// Main test function
async function runTest() {
  console.log('\n🚀 Starting Meta Lead Test');
  console.log(`⏱️  Delay between leads: ${DELAY_SECONDS} seconds\n`);
  
  const startTime = Date.now();
  let successCount = 0;
  
  for (let i = 0; i < leadFiles.length; i++) {
    const success = await sendLead(leadFiles[i], i);
    if (success) successCount++;
    
    // Wait 30 seconds before next lead (except after last one)
    if (i < leadFiles.length - 1) {
      console.log(`\n⏳ Waiting ${DELAY_SECONDS} seconds before next lead...\n`);
      await sleep(DELAY_SECONDS);
    }
  }
  
  const endTime = Date.now();
  const totalTime = ((endTime - startTime) / 1000).toFixed(1);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎯 Test Complete!`);
  console.log(`   Total leads sent: ${successCount}/${leadFiles.length}`);
  console.log(`   Total time: ${totalTime} seconds`);
  console.log(`${'='.repeat(60)}\n`);
}

// Run the test
runTest().catch(error => {
  console.error('💥 Test script crashed:', error);
  process.exit(1);
});