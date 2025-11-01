import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://btotzukjkvwgntiqosjj.supabase.co';
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0b3R6dWtqa3Z3Z250aXFvc2pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMTcwOTYsImV4cCI6MjA3NzU5MzA5Nn0.rUBQjaUhgrT__MgJSs__nArLiPvKq6BrggQ0eoFIvJ8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

