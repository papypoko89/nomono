import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sysamlqxpdzgoanccjjt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5c2FtbHF4cGR6Z29hbmNjamp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNTA1NDIsImV4cCI6MjA5MTkyNjU0Mn0.0a0ziY7qnEUT9KVKY_3Xia-TuSaYjjIYxUnIno_85Ok';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
