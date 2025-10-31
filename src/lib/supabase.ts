import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vkpdvpfxwbhbilrhghqb.supabase.co'; // Replace with your URL
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrcGR2cGZ4d2JoYmlscmhnaHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4OTc5ODksImV4cCI6MjA3NzQ3Mzk4OX0.VPX3lBAKsA2Qr4yFQhm-VKDHPB-byVN7nGeUf2wjaUc'; // Replace with your Key

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});