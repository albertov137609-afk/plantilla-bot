const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const { COLOR, formatDuration } = require('./utils');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { Shoukaku, Connectors } = require('shoukaku');
const { Kazagumo, Plugins } = require('kazagumo');
const KazagumoSpotify = require('kazagumo-spotify');
require('dotenv').config();

if (!process.env.DISCORD_TOKEN) {
  console.error('Falta DISCORD_TOKEN.');
  process.exit(1);
}

if (!process.env.LAVALINK_HOST || !process.env.LAVALINK_PASSWORD) {
  console.error('Faltan LAVALINK_HOST o LAVALINK_PASSWORD.');
  process.exit(1);
}

const configuredDefaultSearchEngine = (process.env.DEFAULT_SEARCH_ENGINE || 'soundcloud').toLowerCase();
const defaultSearchEngine = ['soundcloud', 'youtube', 'spotify'].includes(configuredDefaultSearchEngine)
  ? configuredDefaultSearchEngine
  : 'soundcloud';

if (configuredDefaultSearchEngine !== defaultSearchEngine) {
  console.warn(`[SEARCH] DEFAULT_SEARCH_ENGINE="${configuredDefaultSearchEngine}" no es valido. Usando "${defaultSearchEngine}".`);
}

// ─── Cliente de Discord ───────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ─── Nodos de Lavalink ────────────────────────────────────────────────────────
const lavalinkNodes = [
  {
    name: 'main',
    url: `${process.env.LAVALINK_HOST}:${process.env.LAVALINK_PORT || 2333}`,
    auth: process.env.LAVALINK_PASSWORD,
    secure: process.env.LAVALINK_SECURE === 'true',
  },
];

// ─── Plugins de Kazagumo ──────────────────────────────────────────────────────
const kazagumoPlugins = [];

if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
  kazagumoPlugins.push(
    new KazagumoSpotify({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      countryCode: process.env.SPOTIFY_COUNTRY || 'MX',
    })
  );
  console.log('[SPOTIFY] Plugin de Spotify configurado.');
}

// ─── Kazagumo (queue manager sobre Shoukaku) ──────────────────────────────────
client.kazagumo = new Kazagumo(
  {
    defaultSearchEngine,
    send: (guildId, payload) => {
      const guild = client.guilds.cache.get(guildId);
      if (guild) guild.shard.send(payload);
    },
    plugins: kazagumoPlugins,
  },
  new Connectors.DiscordJS(client),
  lavalinkNodes,
  {
    moveOnDisconnect: false,
    resume: false,
    resumeByLibrary: false,
    reconnectTries: 3,
    reconnectInterval: 5000,
    restTimeout: 60000,
    userAgent: 'discord-music-bot/1.0',
  }
);
client.defaultSearchEngine = defaultSearchEngine;

// ─── Eventos de Kazagumo ─────────────────────────────────────────────────────
client.kazagumo
  .on('playerStart', (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(COLOR.GREEN)
      .setAuthor({ name: '▶  Reproduciendo ahora' })
      .setTitle(track.title)
      .setURL(track.uri || null)
      .setThumbnail(track.thumbnail || null)
      .addFields(
        { name: '⏱ Duración', value: track.isStream ? '🔴 En vivo' : formatDuration(track.length), inline: true },
        { name: '🎤 Artista', value: track.author || '?', inline: true },
      );

    if (track.requester) {
      embed.addFields({ name: '👤 Pedido por', value: `<@${track.requester.id}>`, inline: true });
    }

    const remaining = player.queue.size;
    if (remaining > 0) embed.setFooter({ text: `${remaining} canción(es) en cola` });

    channel.send({ embeds: [embed] });
  })
  .on('playerEnd', (player) => {
    // Cola vacía — el evento playerEmpty lo maneja
  })
  .on('playerEmpty', (player) => {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(COLOR.GRAY)
      .setDescription('✅ Cola terminada. ¡Hasta la próxima!');

    channel.send({ embeds: [embed] });
  })
  .on('playerClosed', (player) => {
    console.log(`[KAZAGUMO] Player cerrado para guild ${player.guildId}`);
  })
  .on('playerException', (player, track, error) => {
    const errorMsg = error?.message || error?.toString?.() || 'Error desconocido';
    const errorType = error?.exception?.type || error?.type || 'Unknown';
    
    console.error(`[KAZAGUMO] Error en player guild ${player.guildId}:`, {
      message: errorMsg,
      type: errorType,
      track: track?.title || 'Unknown',
      fullError: error
    });
    
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(COLOR.RED)
      .setDescription(`❌ Error al reproducir **${track?.title || 'canción'}**: ${errorMsg}`);

    channel.send({ embeds: [embed] });
  })
  .on('playerStuck', (player, track) => {
    console.warn(`[KAZAGUMO] Player atascado en guild ${player.guildId}, saltando...`);
    
    const channel = client.channels.cache.get(player.textId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(COLOR.YELLOW)
        .setDescription(`⏭ **${track?.title || 'Canción'}** se atascó, saltando...`);
      channel.send({ embeds: [embed] }).catch(() => {});
    }
    
    player.skip();
  });

// ─── Eventos de Shoukaku (nodos de Lavalink) ─────────────────────────────────
client.kazagumo.shoukaku
  .on('ready', (name) => console.log(`[LAVALINK] Nodo "${name}" conectado.`))
  .on('error', (name, error) => console.error(`[LAVALINK] Error en nodo "${name}":`, error))
  .on('close', (name, code, reason) => console.warn(`[LAVALINK] Nodo "${name}" cerrado: ${code} ${reason}`))
  .on('disconnect', (name, players, moved) => {
    console.warn(`[LAVALINK] Nodo "${name}" desconectado. Players afectados: ${players.size}`);
  });

// ─── Comandos ─────────────────────────────────────────────────────────────────
const commands = require('./commands');
client.commands = new Collection();
for (const command of commands) {
  client.commands.set(command.data.name, command);
}

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`Bot listo como ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commandBody = commands.map(c => c.data.toJSON());

  try {
    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commandBody,
    });
    console.log('Slash commands globales registrados.');
  } catch (error) {
    console.error('Error registrando comandos globales:', error);
  }

  if (process.env.GUILD_ID) {
    try {
      await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), {
        body: commandBody,
      });
      console.log(`Slash commands registrados para el servidor ${process.env.GUILD_ID}.`);
    } catch (error) {
      console.error('Error registrando comandos de servidor:', error);
    }
  }
});

// ─── Interacciones ────────────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return;

    try {
      await command.autocomplete(interaction, client);
    } catch (error) {
      console.error('Autocomplete error:', error);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error('Command error:', error);
    if (error.code === 10062) return;

    const response = { content: `❌ Error: ${error.message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

client.on('error', error => console.error('Client error:', error));

process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));
process.on('uncaughtException', error => console.error('Uncaught exception:', error));


client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error('Fallo al iniciar el bot:', error);
  process.exit(1);
});
