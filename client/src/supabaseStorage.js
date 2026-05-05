import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isStorageConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabaseStorage = isStorageConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function uploadImageToStorage(file) {
  if (!supabaseStorage) {
    throw new Error("Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para subir imagenes.");
  }

  if (!file) {
    throw new Error("Selecciona una imagen.");
  }

  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const path = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabaseStorage.storage.from("images").upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) throw error;

  const { data } = supabaseStorage.storage.from("images").getPublicUrl(path);
  return data.publicUrl;
}
