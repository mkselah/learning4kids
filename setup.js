import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.43.4/+esm";

export const SUPABASE_URL = "https://exqaziqinrxrvowfhnst.supabase.co"; // REPLACE
export const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV4cWF6aXFpbnJ4cnZvd2ZobnN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1NzEyNjMsImV4cCI6MjA3NTE0NzI2M30.lpDNOnZFNhqcg1hvRlLyfzm9EWtseO4F0OpKT5HGQw4"; // REPLACE
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);