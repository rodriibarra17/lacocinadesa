# La cocina de Sa

Frontend React + Vite para una pasteleria artesanal. No usa backend propio. Productos, recetas y textos se guardan en `localStorage`; Supabase se usa solo para subir imagenes reales a Storage.

## Ejecutar

```bash
cd client
npm install
copy .env.example .env
npm run dev
```

Abrir:

```txt
http://localhost:5173
```

## Supabase Storage

Crear un proyecto gratuito en Supabase y configurar `client/.env`:

```txt
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

En Storage crear un bucket publico llamado:

```txt
images
```

Policies sugeridas para permitir subida publica desde este prototipo frontend:

```sql
create policy "Public can view images"
on storage.objects for select
using (bucket_id = 'images');

create policy "Public can upload images"
on storage.objects for insert
with check (bucket_id = 'images');
```

## Incluye

- Web publica premium y responsive.
- Logo en navbar/footer y favicon con `client/public/images/logo.png`.
- Carrusel automatico horizontal con pausa al hover y scroll manual.
- Carrito con agregar, sumar/restar, eliminar productos y total.
- Boton flotante "Realizar pedido" a WhatsApp: `1123929030`.
- Footer legal con terminos, privacidad, aviso legal, redes y creditos.
- Admin oculto en `/admin`.

## Admin oculto

Entrar manualmente a:

```txt
http://localhost:5173/admin
```

Credenciales:

```txt
Usuario: Sabri
Password: Copito2026
```

El panel permite:

- Crear, editar, eliminar y marcar productos como favoritos.
- Crear, editar y eliminar recetas.
- Editar textos principales de la web.
- Subir imagenes reales a Supabase Storage con previsualizacion.
