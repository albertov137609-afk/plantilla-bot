# Discord Music Bot

Bot de Discord para reproducir musica usando SoundCloud como fuente de audio por defecto y Spotify como fuente de metadata.

## Comandos

| Comando | Descripcion |
| --- | --- |
| `/play [cancion o URL]` | Reproduce o encola una cancion desde Youtube, Spotify o una busqueda normal |
| `/skip` | Salta la cancion actual |
| `/pause` | Pausa la reproduccion |
| `/resume` | Reanuda la reproduccion |
| `/stop` | Detiene la reproduccion y limpia la cola |
| `/queue` | Muestra la cola actual |
| `/volume [0-100]` | Ajusta el volumen |
| `/loop` | Activa o desactiva el bucle de la cola |
| `/join` | Une al bot a tu canal de voz |
| `/leave` | Desconecta al bot |

## Requisitos

- Node.js 22.12.0 o superior
- Un bot de Discord con permisos `View Channel`, `Connect`, `Speak`, `Send Messages` y `Use Application Commands`
- `DISCORD_TOKEN`
- `LAVALINK_HOST`, `LAVALINK_PASSWORD` y opcionalmente `LAVALINK_PORT`
- `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` solo si usaras enlaces de Spotify

## Instalacion

```bash
npm install
copy .env.example .env
```

Completa el archivo `.env`:

```env
DISCORD_TOKEN=tu_token_de_discord
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=false
DEFAULT_SEARCH_ENGINE=soundcloud
SPOTIFY_CLIENT_ID=opcional
SPOTIFY_CLIENT_SECRET=opcional
SOUNDCLOUD_CLIENT_ID=opcional
SOUNDCLOUD_OAUTH_TOKEN=opcional
```

## Uso

```bash
npm run check
npm start
```

Cuando el bot arranque, registrara los slash commands automaticamente.

## Que si funciona

- Busquedas normales: se resuelven en SoundCloud por defecto
- Links de Youtube: se reproducen directamente
- Links de Spotify: se leen como metadata y se buscan coincidencias en SoundCloud

## Nota sobre Lavalink y YouTube

Si Lavalink muestra `This video requires login`, el problema no esta en Discord ni en Kazagumo: YouTube bloqueo el cliente del plugin.

- Solucion rapida: deja `DEFAULT_SEARCH_ENGINE=soundcloud` para que las busquedas por nombre no usen `ytsearch`.
- Solucion completa en Lavalink: configura `poToken` o OAuth en `youtube-plugin` y confirma que el source de YouTube integrado de Lavalink este desactivado.

## Recomendado para Railway

- Configura `SOUNDCLOUD_CLIENT_ID` para evitar depender del client id publico autodetectado
- Si sigues viendo limites, prueba tambien `SOUNDCLOUD_OAUTH_TOKEN`

## Que no soporta este deploy


- Reproduccion directa desde Spotify

## Deploy en Railway

Railway debe usar Node 22.12.0 o superior. Si tu servicio quedo creado con Node 18, actualiza la version en la configuracion del proyecto o vuelve a desplegar despues de subir estos archivos.

Si Railway sigue tomando una version vieja, confirma que:

- el repo remoto tenga el cambio en `package.json`
- exista `.nvmrc` en la raiz
- no tengas fijada manualmente una version anterior de Node en variables o settings del servicio

En Linux y Railway este proyecto usa `ffmpeg` del sistema para evitar crashes del binario `ffmpeg-static`. El archivo `nixpacks.toml` ya pide instalarlo.


