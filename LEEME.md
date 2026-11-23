# SubnetPro (prototipo web)

Sitio estático: no necesita `npm install` ni compilación.

- Probar en tu PC: `python -m http.server 8000` en esta carpeta y abre http://localhost:8000
- Publicar: arrastra esta carpeta a https://app.netlify.com/drop
- Contenido y preguntas: `data/unidades.json`
- Cabeceras de seguridad: `_headers`

## Supabase
- `supabase/schema.sql`: pégalo en SQL Editor y ejecútalo.
- `supabase/functions/chat-redes/index.ts`: Edge Function del asistente.
- `js/config.js`: URL del proyecto y publishable key (nunca la secret key).

Si cambias los puntos clave de `data/unidades.json`, copia también el texto al bloque KNOWLEDGE de la función para que el asistente lo conozca.
