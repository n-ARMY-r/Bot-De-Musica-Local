require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require("@discordjs/voice");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const MUSIC_FOLDER = "/home/mario/canciones_server";
const queues = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("clientReady", () => {
  console.log(`Bot conectado como ${client.user.tag}`);
});

// Buscar cancion en la carpeta
function searchSong(query) {
  const files = fs.readdirSync(MUSIC_FOLDER).filter(f => f.endsWith(".mp3"));
  const queryLower = query.toLowerCase().replace(/\s+/g, "_");

  // Busqueda exacta primero
  const exact = files.find(f => f.toLowerCase() === `${queryLower}.mp3`);
  if (exact) return { title: exact.replace(".mp3", "").replace(/_/g, " "), file: path.join(MUSIC_FOLDER, exact) };

  // Busqueda parcial
  const partial = files.filter(f => f.toLowerCase().includes(queryLower));
  if (partial.length > 0) return { title: partial[0].replace(".mp3", "").replace(/_/g, " "), file: path.join(MUSIC_FOLDER, partial[0]) };

  // Busqueda por palabras individuales
  const words = query.toLowerCase().split(" ");
  const byWords = files.find(f => words.every(w => f.toLowerCase().includes(w)));
  if (byWords) return { title: byWords.replace(".mp3", "").replace(/_/g, " "), file: path.join(MUSIC_FOLDER, byWords) };

  return null;
}

// Listar todas las canciones
function listSongs() {
  return fs.readdirSync(MUSIC_FOLDER)
    .filter(f => f.endsWith(".mp3"))
    .map(f => f.replace(".mp3", "").replace(/_/g, " "));
}

async function playNext(guildId, channel) {
  const queue = queues.get(guildId);
  if (!queue) return;
  if (queue.songs.length === 0) return;

  const song = queue.songs[queue.index];
  if (!song) {
    channel.send("No hay mas canciones en la cola. Usa `!stop` para desconectarme.");
    return;
  }

  try {
    const ffmpegProcess = spawn("ffmpeg", [
      "-i", song.file,
      "-analyzeduration", "0",
      "-loglevel", "0",
      "-filter:a", `volume=${queue.volume}`,
      "-f", "s16le",
      "-ar", "48000",
      "-ac", "2",
      "pipe:1"
    ]);

    const resource = createAudioResource(ffmpegProcess.stdout, {
      inputType: require("@discordjs/voice").StreamType.Raw
    });

    queue.player.play(resource);
    queue.currentProcess = ffmpegProcess;

    const loopIndicator = queue.loop === "song" ? " 🔂" : queue.loop === "queue" ? " 🔁" : "";
    channel.send(`🎵 Reproduciendo: **${song.title}**${loopIndicator}`);

    queue.player.once(AudioPlayerStatus.Idle, () => {
      if (queue.loop === "song") {
        playNext(guildId, channel);
      } else if (queue.loop === "queue") {
        queue.index = (queue.index + 1) % queue.songs.length;
        playNext(guildId, channel);
      } else {
        queue.index++;
        if (queue.index >= queue.songs.length) {
          queue.index = 0;
          queue.songs = [];
          channel.send("No hay mas canciones en la cola. Usa `!stop` para desconectarme.");
          return;
        }
        playNext(guildId, channel);
      }
    });

  } catch (err) {
    console.error(err);
    channel.send("❌ Error al reproducir, pasando a la siguiente...");
    queue.index++;
    playNext(guildId, channel);
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const prefix = "!";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(" ");
  const command = args.shift().toLowerCase();
  const query = args.join(" ").trim();

  const guildId = message.guild.id;

  // ── !play ──────────────────────────────────────────
  if (command === "play") {
    if (!query) return message.reply("❌ Escribe el nombre de una canción.");

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply("❌ Entra a un canal de voz primero.");

    let song = searchSong(query);

if (!song) {
  await message.reply(`⬇️ No encontré **${query}** en la biblioteca. Descargando...`);
  
  try {
    await new Promise((resolve, reject) => {
      const proceso = spawn("python3", [
        "/home/mario/Bot-De-Musica-Local/Bot-Descargas.py",
        "--auto",
        query
      ]);

      proceso.stdout.on("data", (data) => console.log(data.toString()));
      proceso.stderr.on("data", (data) => console.error(data.toString()));
      proceso.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error("Error al descargar"));
      });
    });

    // Esperar un momento y buscar de nuevo
    await new Promise(r => setTimeout(r, 2000));
    song = searchSong(query);

    if (!song) return message.channel.send("❌ No se pudo descargar la canción.");
    message.channel.send(`✅ Descargada y lista para reproducir.`);

  } catch (err) {
    console.error(err);
    return message.channel.send("❌ Error al descargar la canción.");
  }
}

    if (!queues.has(guildId)) {
      const player = createAudioPlayer();
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: message.guild.voiceAdapterCreator
      });
      connection.subscribe(player);

      queues.set(guildId, {
        songs: [song],
        index: 0,
        player,
        connection,
        paused: false,
        loop: "none",
        volume: 1.0
      });

      playNext(guildId, message.channel);
    } else {
      const queue = queues.get(guildId);
      queue.songs.push(song);
      message.reply(`➕ Agregado a la cola: **${song.title}**`);
      if (queue.songs.length === 1) {
        playNext(guildId, message.channel);
      }
    }
  }

  // ── !buscar ────────────────────────────────────────
  else if (command === "buscar") {
    if (!query) return message.reply("❌ Escribe algo para buscar.");

    const files = fs.readdirSync(MUSIC_FOLDER).filter(f => f.endsWith(".mp3"));
    const words = query.toLowerCase().split(" ");
    const results = files
      .filter(f => words.some(w => f.toLowerCase().includes(w)))
      .slice(0, 10)
      .map(f => f.replace(".mp3", "").replace(/_/g, " "));

    if (!results.length) return message.reply(`❌ No encontré nada con **${query}**.`);

    message.reply(`🔍 Resultados para **${query}**:\n${results.map((r, i) => `${i + 1}. ${r}`).join("\n")}`);
  }

  // ── !biblioteca ────────────────────────────────────
  else if (command === "biblioteca") {
    const songs = listSongs();
    const page = parseInt(args[0]) || 1;
    const perPage = 15;
    const start = (page - 1) * perPage;
    const total = Math.ceil(songs.length / perPage);
    const list = songs.slice(start, start + perPage).map((s, i) => `${start + i + 1}. ${s}`).join("\n");

    message.reply(`🎵 **Biblioteca (página ${page}/${total}) — ${songs.length} canciones:**\n${list}\n\nUsa \`!biblioteca 2\` para ver más.`);
  }

  // ── !pause ─────────────────────────────────────────
  else if (command === "pause") {
    const queue = queues.get(guildId);
    if (!queue) return message.reply("❌ No hay música reproduciéndose.");

    if (queue.paused) {
      queue.player.unpause();
      queue.paused = false;
      message.reply("▶️ Reanudado.");
    } else {
      queue.player.pause();
      queue.paused = true;
      message.reply("⏸️ Pausado.");
    }
  }

  // ── !skip ──────────────────────────────────────────
  else if (command === "skip") {
    const queue = queues.get(guildId);
    if (!queue) return message.reply("❌ No hay música reproduciéndose.");
    queue.player.removeAllListeners(AudioPlayerStatus.Idle);
    queue.index++;
    queue.player.stop();
    message.reply("⏭️ Saltando...");
    playNext(guildId, message.channel);
  }

  // ── !prev ──────────────────────────────────────────
  else if (command === "prev") {
    const queue = queues.get(guildId);
    if (!queue) return message.reply("❌ No hay música reproduciéndose.");
    if (queue.index <= 0) return message.reply("❌ No hay canción anterior.");
    queue.player.removeAllListeners(AudioPlayerStatus.Idle);
    queue.index--;
    queue.player.stop();
    message.reply("⏮️ Volviendo a la anterior...");
    playNext(guildId, message.channel);
  }

  // ── !stop ──────────────────────────────────────────
  else if (command === "stop") {
    const queue = queues.get(guildId);
    if (!queue) return message.reply("❌ El bot no esta conectado.");
    if (queue.songs.length > 0) {
      return message.reply("🧹 Debes limpiar la cola antes. Usa `!clean`.");
    }
    queue.player.stop();
    queue.connection.destroy();
    queues.delete(guildId);
    message.reply("⏹️ Bot desconectado.");
  }

  // ── !clean ─────────────────────────────────────────
  else if (command === "clean") {
    const queue = queues.get(guildId);
    if (!queue) return message.reply("❌ No hay nada en cola.");
    queue.player.removeAllListeners(AudioPlayerStatus.Idle);
    queue.player.stop();
    queue.songs = [];
    queue.index = 0;
    message.reply("✅ Cola limpiada. Ahora puedes usar `!stop`.");
  }

  // ── !colas ─────────────────────────────────────────
  else if (command === "colas") {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) return message.reply("❌ La cola está vacía.");
    const list = queue.songs
      .slice(queue.index, queue.index + 10)
      .map((s, i) => `${i === 0 ? "▶️" : `${queue.index + i + 1}.`} ${s.title}`)
      .join("\n");
    message.reply(`🎵 **Cola actual:**\n${list}`);
  }

  // ── !loop ──────────────────────────────────────────
  else if (command === "loop") {
    const queue = queues.get(guildId);
    if (!queue) return message.reply("❌ No hay música reproduciéndose.");
    const modes = ["none", "song", "queue"];
    const labels = { none: "desactivado ❌", song: "🔂 canción", queue: "🔁 cola" };
    const currentIndex = modes.indexOf(queue.loop);
    queue.loop = modes[(currentIndex + 1) % modes.length];
    message.reply(`Loop ${labels[queue.loop]}.`);
  }

  // ── !volume ────────────────────────────────────────
  else if (command === "volume") {
    const queue = queues.get(guildId);
    if (!queue) return message.reply("❌ No hay música reproduciéndose.");
    const vol = parseInt(args[0]);
    if (isNaN(vol) || vol < 1 || vol > 200) {
      return message.reply(`🔊 Volumen actual: **${Math.round(queue.volume * 100)}%**\nUso: \`!volume 1-200\``);
    }
    queue.volume = vol / 100;
    message.reply(`🔊 Volumen ajustado a **${vol}%**.`);
  }

  // ── !shuffle ───────────────────────────────────────
  else if (command === "shuffle") {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) return message.reply("❌ La cola está vacía.");
    const played = queue.songs.slice(0, queue.index + 1);
    const remaining = queue.songs.slice(queue.index + 1);
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    queue.songs = [...played, ...remaining];
    message.reply("🔀 Cola mezclada!");
  }

  // ── !np ────────────────────────────────────────────
  else if (command === "nowplaying" || command === "np") {
    const queue = queues.get(guildId);
    if (!queue) return message.reply("❌ No hay música reproduciéndose.");
    const song = queue.songs[queue.index];
    if (!song) return message.reply("❌ No hay canción actual.");
    const loopStatus = queue.loop === "song" ? "🔂 Canción" : queue.loop === "queue" ? "🔁 Cola" : "❌";
    message.reply(`🎵 **Reproduciendo ahora:**\n**${song.title}**\n🔊 Volumen: ${Math.round(queue.volume * 100)}%\n🔁 Loop: ${loopStatus}\n📋 Posición: ${queue.index + 1}/${queue.songs.length}`);
  }

  // ── !help ──────────────────────────────────────────
  else if (command === "help") {
    message.reply(`🎵 **Comandos de MORFEO:**
\`!play <canción>\` — Reproducir una canción de la biblioteca
\`!buscar <nombre>\` — Buscar canciones en la biblioteca
\`!biblioteca\` — Ver todas las canciones (paginado)
\`!pause\` — Pausar/reanudar
\`!skip\` — Saltar a la siguiente
\`!prev\` — Volver a la anterior
\`!stop\` — Desconectar el bot
\`!clean\` — Limpiar la cola
\`!colas\` — Ver la cola actual
\`!loop\` — Cambiar modo de repetición
\`!shuffle\` — Mezclar la cola
\`!volume <1-200>\` — Ajustar volumen
\`!np\` — Ver canción actual
\`!help\` — Ver esta lista`);
  }
});

client.login(process.env.TOKEN);