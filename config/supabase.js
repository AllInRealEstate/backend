// backend/config/supabase.js
const { createClient } = require('@supabase/supabase-js');

let supabaseInstance = null; // Cache the instance

const connectSupabase = () => {
  
  // If already initialized, return cached instance silently
  if (supabaseInstance) {
    return supabaseInstance;
  }

  try {

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_KEY is missing');
    }

    supabaseInstance = createClient(supabaseUrl, supabaseKey);

    // ✅ Print AFTER successful connection
    console.log('✅ Supabase Client Initialized'); 
    
    return supabaseInstance;

  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectSupabase;