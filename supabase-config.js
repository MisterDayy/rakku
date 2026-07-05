// Konfigurasi koneksi ke Supabase.
// anon key ini memang aman ditaruh di frontend/publik (bukan secret key),
// karena akses datanya tetap dibatasi oleh Row Level Security di database.
const SUPABASE_URL = "https://lqixsabpmyflguisblrb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxaXhzYWJwbXlmbGd1aXNibHJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjI4NDcsImV4cCI6MjA5ODgzODg0N30.QVdxWkMguIbJ0T5uqomBKwN7PBAYeb_xNjRfh67W1-E";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
