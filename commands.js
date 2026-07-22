const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { formatDuration, COLOR } = require('./utils');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function errorEmbed(desc) {
  return new EmbedBuilder().setColor(COLOR.RED).setDescription(`❌ ${desc}`);
}
function successEmbed(desc) {
  return new EmbedBuilder().setColor(COLOR.GREEN).setDescription(desc);
}
function infoEmbed(desc) {
  return new EmbedBuilder().setColor(COLOR.BLUE).setDescription(desc);
}

function getVoiceJoinError(interaction) {
  const vc = interaction.member?.voice?.channel;
  if (!vc) return 'Debes estar en un canal de voz.';
  const perms = vc.permissionsFor(interaction.guild.members.me);
  if (!perms?.has('ViewChannel')) return `Sin permiso para ver **${vc.name}**.`;
  if (!perms.has('Connect'))      return `Sin permiso para conectarme a **${vc.name}**.`;
  if (!perms.has('Speak'))        return `Sin permiso para hablar en **${vc.name}**.`;
  if (vc.full && !perms.has('MoveMembers')) return `**${vc.name}** esta lleno.`;
  return null;
}

async function getOrCreatePlayer(interaction, client) {
  const vc = interaction.member?.voice?.channel;
  let player = client.kazagumo.players.get(interaction.guildId);

  if (!player) {
    player = await client.kazagumo.createPlayer({
      guildId: interaction.guildId,
      textId: interaction.channelId,
      voiceId: vc.id,
      deaf: true,
      volume: 80,
    });
  }

  return player;
}

function resolveSearchEngine(query, defaultSearchEngine = 'soundcloud') {
  const normalizedQuery = query.toLowerCase();

  if (normalizedQuery.includes('spotify.com')) return 'spotify';
  if (normalizedQuery.includes('youtu')) return 'youtube';
  if (normalizedQuery.includes('soundcloud.com')) return 'soundcloud';

  return defaultSearchEngine;
}

function formatAutocompleteLabel(track) {
  const title = track?.title?.replace(/\s+/g, ' ').trim() || 'Sin título';
  const artist = track?.author?.replace(/\s+/g, ' ').trim() || 'Artista desconocido';
  const duration = track?.isStream ? '🔴 En vivo' : formatDuration(track?.length);
  return `${title} — ${artist} • ${duration}`;
}

// ─── /play ───────────────────────────────────────────────────────────────────
const play = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce musica desde YouTube, Spotify o busqueda')
    .addStringOption(o =>
      o.setName('query')
        .setDescription('Nombre, URL de YouTube o Spotify')
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async autocomplete(interaction, client) {
    const focusedValue = interaction.options.getFocused().trim();
    if (!focusedValue) {
      return interaction.respond([]);
    }

    try {
      const searchEngine = resolveSearchEngine(focusedValue, client.defaultSearchEngine || 'soundcloud');
      const result = await client.kazagumo.search(focusedValue, {
        requester: interaction.user,
        engine: searchEngine,
      });

      const suggestions = (result?.tracks || [])
        .slice(0, 8)
        .map(track => ({
          name: formatAutocompleteLabel(track),
          value: track.uri || track.title,
        }));

      return interaction.respond(suggestions);
    } catch (error) {
      console.error('Autocomplete error:', error);
      return interaction.respond([]);
    }
  },

  async execute(interaction, client) {
    await interaction.deferReply();

    const joinError = getVoiceJoinError(interaction);
    if (joinError) return interaction.editReply({ embeds: [errorEmbed(joinError)] });

    const query = interaction.options.getString('query', true);

    try {
      const player = await getOrCreatePlayer(interaction, client);

      // Determinar el engine correcto según el tipo de query
      const searchEngine = resolveSearchEngine(query, client.defaultSearchEngine || 'soundcloud');

      const result = await client.kazagumo.search(query, {
        requester: interaction.user,
        engine: searchEngine,
      });

      if (!result || !result.tracks.length) {
        return interaction.editReply({ embeds: [errorEmbed(`Sin resultados para: **${query}**`)] });
      }

      if (result.type === 'PLAYLIST') {
        for (const track of result.tracks) player.queue.add(track);

        const embed = new EmbedBuilder()
          .setColor(COLOR.BLUE)
          .setAuthor({ name: '📋 Playlist encolada' })
          .setTitle(result.playlistName || 'Playlist')
          .setThumbnail(result.tracks[0]?.thumbnail || null)
          .addFields({ name: '🎵 Canciones', value: `${result.tracks.length}`, inline: true })
          .setFooter({ text: `Pedido por ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

        if (!player.playing && !player.paused) player.play();
        return interaction.editReply({ embeds: [embed] });
      }

      // Canción individual
      const track = result.tracks[0];
      player.queue.add(track);

      if (!player.playing && !player.paused) player.play();

      // Si ya está reproduciendo, mostrar "agregado a la cola"
      if (player.queue.size > 1 || player.playing) {
        const embed = new EmbedBuilder()
          .setColor(COLOR.BLUE)
          .setAuthor({ name: '➕ Agregado a la cola' })
          .setTitle(track.title)
          .setURL(track.uri || null)
          .setThumbnail(track.thumbnail || null)
          .addFields(
            { name: '⏱ Duración', value: track.isStream ? '🔴 En vivo' : formatDuration(track.length), inline: true },
            { name: '📋 Posición', value: `#${player.queue.size}`, inline: true },
          );
        return interaction.editReply({ embeds: [embed] });
      }

      return interaction.editReply({ embeds: [infoEmbed(`🔍 Cargando **${track.title}**...`)] });

    } catch (error) {
      console.error('Play error:', error);
      return interaction.editReply({ embeds: [errorEmbed(error.message || 'Error desconocido.')] });
    }
  },
};

// ─── /skip ───────────────────────────────────────────────────────────────────
const skip = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Salta la cancion actual'),

  async execute(interaction, client) {
    const player = client.kazagumo.players.get(interaction.guildId);
    if (!player?.playing) return interaction.reply({ embeds: [errorEmbed('No hay musica en reproduccion.')], ephemeral: true });

    const skipped = player.queue.current;
    player.skip();
    return interaction.reply({ embeds: [successEmbed(`⏭ Saltada: **${skipped?.title || 'cancion'}**`)] });
  },
};

// ─── /stop ───────────────────────────────────────────────────────────────────
const stop = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Detiene la musica y limpia la cola'),

  async execute(interaction, client) {
    const player = client.kazagumo.players.get(interaction.guildId);
    if (!player) return interaction.reply({ embeds: [errorEmbed('No hay nada reproduciendose.')], ephemeral: true });

    player.destroy();
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.RED).setDescription('⏹ Reproduccion detenida.')] });
  },
};

// ─── /pause ──────────────────────────────────────────────────────────────────
const pause = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pausa la reproduccion'),

  async execute(interaction, client) {
    const player = client.kazagumo.players.get(interaction.guildId);
    if (!player?.playing) return interaction.reply({ embeds: [errorEmbed('No hay nada reproduciendose.')], ephemeral: true });
    if (player.paused) return interaction.reply({ embeds: [infoEmbed('Ya esta pausado.')], ephemeral: true });

    player.pause(true);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.YELLOW).setDescription(`⏸ Pausado: **${player.queue.current?.title || 'cancion'}**`)] });
  },
};

// ─── /resume ─────────────────────────────────────────────────────────────────
const resume = {
  data: new SlashCommandBuilder().setName('resume').setDescription('Reanuda la reproduccion'),

  async execute(interaction, client) {
    const player = client.kazagumo.players.get(interaction.guildId);
    if (!player) return interaction.reply({ embeds: [errorEmbed('No hay nada en pausa.')], ephemeral: true });
    if (!player.paused) return interaction.reply({ embeds: [infoEmbed('No esta pausado.')], ephemeral: true });

    player.pause(false);
    return interaction.reply({ embeds: [successEmbed(`▶ Reanudado: **${player.queue.current?.title || 'cancion'}**`)] });
  },
};

// ─── /queue ──────────────────────────────────────────────────────────────────
const queueCmd = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Muestra la cola actual')
    .addIntegerOption(o => o.setName('pagina').setDescription('Numero de pagina').setMinValue(1)),

  async execute(interaction, client) {
    const player = client.kazagumo.players.get(interaction.guildId);
    if (!player?.queue.current) return interaction.reply({ embeds: [infoEmbed('La cola esta vacia.')], ephemeral: true });

    const PAGE_SIZE = 10;
    const page = Math.max(0, (interaction.options.getInteger('pagina') || 1) - 1);
    const upcoming = [...player.queue];
    const totalPages = Math.max(1, Math.ceil(upcoming.length / PAGE_SIZE));
    const clampedPage = Math.min(page, totalPages - 1);
    const slice = upcoming.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE);
    const current = player.queue.current;

    const totalMs = [current, ...upcoming].reduce((acc, t) => acc + (t?.length || 0), 0);

    const embed = new EmbedBuilder()
      .setColor(COLOR.BLUE)
      .setAuthor({ name: `Cola de ${interaction.guild.name}`, iconURL: interaction.guild.iconURL() })
      .setThumbnail(current.thumbnail || null)
      .addFields({
        name: '▶ Reproduciendo ahora',
        value: `[${current.title}](${current.uri}) \`${formatDuration(current.length)}\``,
      });

    if (slice.length) {
      embed.addFields({
        name: `Proximas — Pagina ${clampedPage + 1}/${totalPages}`,
        value: slice.map((t, i) =>
          `\`${clampedPage * PAGE_SIZE + i + 1}.\` [${t.title}](${t.uri}) \`${formatDuration(t.length)}\``
        ).join('\n'),
      });
    } else {
      embed.addFields({ name: 'Cola', value: 'No hay mas canciones.' });
    }

    embed.setFooter({ text: `${upcoming.length + 1} cancion(es) · Duracion total: ${formatDuration(totalMs)}` });
    return interaction.reply({ embeds: [embed] });
  },
};

// ─── /nowplaying ─────────────────────────────────────────────────────────────
const nowplaying = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('Muestra la cancion actual con barra de progreso'),

  async execute(interaction, client) {
    const player = client.kazagumo.players.get(interaction.guildId);
    if (!player?.queue.current) return interaction.reply({ embeds: [infoEmbed('No hay nada reproduciendose.')], ephemeral: true });

    const track = player.queue.current;
    const elapsed = player.shoukaku.position || 0;
    const total = track.length || 0;
    const BAR = 20;
    const filled = total > 0 ? Math.round((elapsed / total) * BAR) : 0;
    const bar = '▓'.repeat(filled) + '░'.repeat(BAR - filled);
    const loopLabels = { none: 'Off', track: 'Cancion', queue: 'Cola' };

    const embed = new EmbedBuilder()
      .setColor(COLOR.GREEN)
      .setAuthor({ name: '▶  Reproduciendo ahora' })
      .setTitle(track.title)
      .setURL(track.uri || null)
      .setThumbnail(track.thumbnail || null)
      .setDescription(`\`${formatDuration(elapsed)}\` ${bar} \`${formatDuration(total)}\``)
      .addFields(
        { name: '⏱ Duracion', value: track.isStream ? '🔴 En vivo' : formatDuration(track.length), inline: true },
        { name: '🔁 Loop', value: loopLabels[player.loop] || 'Off', inline: true },
        { name: '🔊 Volumen', value: `${player.volume}%`, inline: true },
      );

    const next = player.queue[0];
    if (next) embed.addFields({ name: '⏭ Siguiente', value: next.title });

    if (track.requester) embed.setFooter({ text: `Pedido por ${track.requester.username}`, iconURL: track.requester.displayAvatarURL() });

    return interaction.reply({ embeds: [embed] });
  },
};

// ─── /volume ─────────────────────────────────────────────────────────────────
const volume = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Ajusta el volumen (0-100)')
    .addIntegerOption(o =>
      o.setName('nivel').setDescription('Nivel de volumen').setMinValue(0).setMaxValue(100).setRequired(true)
    ),

  async execute(interaction, client) {
    const player = client.kazagumo.players.get(interaction.guildId);
    if (!player) return interaction.reply({ embeds: [errorEmbed('No hay nada reproduciendose.')], ephemeral: true });

    const level = interaction.options.getInteger('nivel', true);
    player.setVolume(level);
    const bars = Math.round(level / 10);
    const bar = '🟩'.repeat(bars) + '⬛'.repeat(10 - bars);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR.BLUE).setDescription(`${bar}\n**Volumen:** ${level}%`)] });
  },
};

// ─── /loop ───────────────────────────────────────────────────────────────────
const loop = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Cambia el modo de repeticion')
    .addStringOption(o =>
      o.setName('modo').setDescription('Modo').setRequired(true)
        .addChoices(
          { name: '🚫 Off', value: 'none' },
          { name: '🔂 Cancion actual', value: 'track' },
          { name: '🔁 Toda la cola', value: 'queue' },
        )
    ),

  async execute(interaction, client) {
    const player = client.kazagumo.players.get(interaction.guildId);
    if (!player) return interaction.reply({ embeds: [errorEmbed('No hay nada reproduciendose.')], ephemeral: true });

    const mode = interaction.options.getString('modo', true);
    player.setLoop(mode);
    const labels = { none: '🚫 Loop desactivado', track: '🔂 Repitiendo cancion actual', queue: '🔁 Repitiendo toda la cola' };
    return interaction.reply({ embeds: [successEmbed(labels[mode])] });
  },
};

// ─── /shuffle ────────────────────────────────────────────────────────────────
const shuffle = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Mezcla las canciones en la cola'),

  async execute(interaction, client) {
    const player = client.kazagumo.players.get(interaction.guildId);
    if (!player || player.queue.size < 2) {
      return interaction.reply({ embeds: [errorEmbed('No hay suficientes canciones en la cola.')], ephemeral: true });
    }
    player.queue.shuffle();
    return interaction.reply({ embeds: [successEmbed(`🔀 Cola mezclada · **${player.queue.size}** canciones reordenadas.`)] });
  },
};

// ─── /join ───────────────────────────────────────────────────────────────────
const join = {
  data: new SlashCommandBuilder().setName('join').setDescription('Conecta el bot a tu canal de voz'),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    const joinError = getVoiceJoinError(interaction);
    if (joinError) return interaction.editReply({ embeds: [errorEmbed(joinError)] });

    try {
      await getOrCreatePlayer(interaction, client);
      const vc = interaction.member.voice.channel;
      return interaction.editReply({ embeds: [successEmbed(`Conectado a **${vc.name}**`)] });
    } catch (error) {
      return interaction.editReply({ embeds: [errorEmbed(error.message)] });
    }
  },
};

// ─── /leave ──────────────────────────────────────────────────────────────────
const leave = {
  data: new SlashCommandBuilder().setName('leave').setDescription('Desconecta el bot del canal de voz'),

  async execute(interaction, client) {
    const player = client.kazagumo.players.get(interaction.guildId);
    if (player) player.destroy();
    return interaction.reply({ embeds: [infoEmbed('👋 Desconectado del canal de voz.')] });
  },
};

module.exports = [
  play, skip, stop, pause, resume,
  queueCmd, nowplaying, volume, loop, shuffle,
  join, leave,
];
