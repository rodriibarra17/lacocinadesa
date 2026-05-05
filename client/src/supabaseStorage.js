import supabase from "./supabase";

export const isStorageConfigured = Boolean(supabase);
export const supabaseStorage = supabase;

export async function uploadImageToStorage(file) {
  if (!supabase) {
    throw new Error("No se pudo conectar con Supabase para subir imagenes.");
  }

  if (!file) {
    throw new Error("Selecciona una imagen.");
  }

  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const path = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from("images").upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });

  if (error) {
    console.error("SUPABASE ERROR:", error);
    throw error;
  }

  const { data } = supabase.storage.from("images").getPublicUrl(path);
  return data.publicUrl;
}
