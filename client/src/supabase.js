import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://crldvmisbvzivzxwniot.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNybGR2bWlzYnZ6aXZ6eG53aW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMDUzMDgsImV4cCI6MjA5MzU4MTMwOH0.HzcIiilT0AuJW_WG3SnYFyWdZi-XShYhZxep-fiBgF0"
);

export default supabase;
