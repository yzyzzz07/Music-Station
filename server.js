const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ||
  "https://music-station-255y.onrender.com/callback";

const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state"
].join(" ");

// =====================================================
// MEMÓRIA DO SERVIDOR
// =====================================================

const loginStates = new Map();

let spotify = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0
};

// =====================================================
// CORS
// =====================================================

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

// =====================================================
// PÁGINA INICIAL
// =====================================================

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Music Station</title>

      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 40px;
          background: white;
          color: #111;
        }

        a {
          display: inline-block;
          margin-top: 20px;
          padding: 15px 25px;
          background: #1DB954;
          color: white;
          text-decoration: none;
          border-radius: 10px;
          font-size: 18px;
        }
      </style>
    </head>

    <body>
      <h1>🎵 Music Station</h1>
      <p>Servidor Spotify funcionando.</p>

      <a href="/login">
        Conectar Spotify
      </a>
    </body>
    </html>
  `);
});

// =====================================================
// LOGIN
// =====================================================

app.get("/login", (req, res) => {

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send(
      "ERRO: SPOTIFY_CLIENT_ID ou SPOTIFY_CLIENT_SECRET não configurado."
    );
  }

  const state = crypto.randomBytes(16).toString("hex");

  loginStates.set(state, {
    criado: Date.now()
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: state,
    show_dialog: "true"
  });

  const spotifyURL =
    "https://accounts.spotify.com/authorize?" +
    params.toString();

  console.log("Redirecionando para Spotify...");

  res.redirect(spotifyURL);
});

// =====================================================
// CALLBACK
// =====================================================

app.get("/callback", async (req, res) => {

  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(
      "Spotify recusou a autorização: " + error
    );
  }

  if (!code) {
    return res.status(400).send(
      "Código de autorização não recebido."
    );
  }

  if (!state || !loginStates.has(state)) {
    return res.status(400).send(
      "Erro de segurança: state inválido."
    );
  }

  loginStates.delete(state);

  try {

    // =================================================
    // PEGAR TOKEN
    // =================================================

    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",

      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI
      }).toString(),

      {
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",

          "Authorization":
            "Basic " +
            Buffer.from(
              CLIENT_ID + ":" + CLIENT_SECRET
            ).toString("base64")
        }
      }
    );

    const {
      access_token,
      refresh_token,
      expires_in
    } = tokenResponse.data;

    // =================================================
    // SALVAR TOKEN
    // =================================================

    spotify.accessToken = access_token;

    if (refresh_token) {
      spotify.refreshToken = refresh_token;
    }

    spotify.expiresAt =
      Date.now() + (expires_in * 1000);

    console.log("=================================");
    console.log("SPOTIFY CONECTADO!");
    console.log("Access Token: SIM");
    console.log("Refresh Token:", refresh_token ? "SIM" : "NÃO");
    console.log("=================================");

    // Vai para a página da música
    res.redirect("/now-playing");

  } catch (error) {

    console.error(
      "ERRO NO CALLBACK:",
      error.response?.data || error.message
    );

    res.status(500).send(`
      <h1>❌ Erro ao conectar Spotify</h1>
      <pre>${escapeHtml(
        JSON.stringify(
          error.response?.data || error.message,
          null,
          2
        )
      )}</pre>
    `);
  }
});

// =====================================================
// ATUALIZAR ACCESS TOKEN
// =====================================================

async function refreshAccessToken() {

  if (!spotify.refreshToken) {
    return false;
  }

  try {

    const response = await axios.post(
      "https://accounts.spotify.com/api/token",

      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: spotify.refreshToken
      }).toString(),

      {
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",

          "Authorization":
            "Basic " +
            Buffer.from(
              CLIENT_ID + ":" + CLIENT_SECRET
            ).toString("base64")
        }
      }
    );

    spotify.accessToken =
      response.data.access_token;

    if (response.data.refresh_token) {
      spotify.refreshToken =
        response.data.refresh_token;
    }

    spotify.expiresAt =
      Date.now() +
      (response.data.expires_in * 1000);

    console.log("Access Token renovado.");

    return true;

  } catch (error) {

    console.error(
      "Erro ao renovar token:",
      error.response?.data || error.message
    );

    return false;
  }
}

// =====================================================
// GARANTIR TOKEN VÁLIDO
// =====================================================

async function ensureToken() {

  if (!spotify.accessToken) {
    return false;
  }

  // Renova 60 segundos antes de expirar
  if (
    Date.now() >
    spotify.expiresAt - 60000
  ) {
    return await refreshAccessToken();
  }

  return true;
}

// =====================================================
// PEGAR MÚSICA ATUAL
// =====================================================

async function getCurrentTrack() {

  if (!(await ensureToken())) {
    return null;
  }

  try {

    const response = await axios.get(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization:
            "Bearer " + spotify.accessToken
        },
        validateStatus: () => true
      }
    );

    // Nenhuma música
    if (response.status === 204) {
      return null;
    }

    // Token expirado
    if (response.status === 401) {

      if (await refreshAccessToken()) {
        return await getCurrentTrack();
      }

      return null;
    }

    if (
      response.status !== 200 ||
      !response.data ||
      !response.data.item
    ) {
      return null;
    }

    const item = response.data.item;

    return {

      nome: item.name,

      artista: item.artists
        .map(artist => artist.name)
        .join(", "),

      album: item.album
        ? item.album.name
        : "",

      capa:
        item.album &&
        item.album.images &&
        item.album.images.length > 0
          ? item.album.images[0].url
          : null,

      duracao_ms:
        item.duration_ms || 0,

      duracao_minutos:
        Math.round(
          (item.duration_ms || 0) / 60000
        ),

      tocando:
        response.data.is_playing || false
    };

  } catch (error) {

    console.error(
      "Erro ao consultar Spotify:",
      error.response?.data || error.message
    );

    return null;
  }
}

// =====================================================
// PÁGINA NOW PLAYING
// =====================================================

app.get("/now-playing", async (req, res) => {

  const musica = await getCurrentTrack();

  if (!spotify.accessToken) {
    return res.send(`
      <h1>❌ Spotify não conectado</h1>
      <a href="/login">Conectar Spotify</a>
    `);
  }

  if (!musica) {

    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport"
              content="width=device-width,initial-scale=1">
        <title>Music Station</title>
      </head>

      <body style="
        font-family:Arial;
        text-align:center;
        padding:40px;
      ">

        <h1>✅ Spotify conectado!</h1>

        <p>
          Nenhuma música está tocando agora.
        </p>

        <p>
          Coloque uma música para tocar e
          atualize esta página.
        </p>

      </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">

    <head>
      <meta charset="UTF-8">
      <meta name="viewport"
            content="width=device-width,initial-scale=1">

      <title>Music Station</title>

      <style>

        body {
          font-family: Arial, sans-serif;
          text-align: center;
          padding: 30px;
          background: white;
          color: #111;
        }

        img {
          width: 200px;
          height: 200px;
          object-fit: cover;
          border-radius: 12px;
        }

        h1 {
          margin-top: 20px;
          margin-bottom: 5px;
        }

        p {
          font-size: 18px;
        }

      </style>
    </head>

    <body>

      <h2>🎵 Music Station</h2>

      ${
        musica.capa
          ? `<img src="${musica.capa}">`
          : ""
      }

      <h1>
        ${escapeHtml(musica.nome)}
      </h1>

      <p>
        👤 ${escapeHtml(musica.artista)}
      </p>

      <p>
        💿 ${escapeHtml(musica.album)}
      </p>

      <p>
        ⏱️ Duração:
        ${formatDuration(musica.duracao_ms)}
      </p>

      <p>
        ${
          musica.tocando
            ? "▶️ Tocando"
            : "⏸️ Pausada"
        }
      </p>

      <hr>

      <p>
        API:
        <a href="/api/now-playing">
          /api/now-playing
        </a>
      </p>

    </body>
    </html>
  `);
});

// =====================================================
// API PARA O ESP32
// =====================================================

app.get("/api/now-playing", async (req, res) => {

  const musica = await getCurrentTrack();

  if (!spotify.accessToken) {

    return res.status(401).json({
      conectado: false,
      erro: "Spotify não conectado"
    });
  }

  if (!musica) {

    return res.json({
      conectado: true,
      musica: null
    });
  }

  res.json({
    conectado: true,
    musica: musica
  });
});

// =====================================================
// TESTE DO SPOTIFY
// =====================================================

app.get("/status", (req, res) => {

  res.json({

    servidor: "Music Station",

    spotify_conectado:
      !!spotify.accessToken,

    token_valido:
      !!spotify.accessToken &&
      Date.now() < spotify.expiresAt

  });
});

// =====================================================
// SEGURANÇA HTML
// =====================================================

function escapeHtml(text) {

  if (!text) return "";

  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =====================================================
// FORMATO DA DURAÇÃO
// =====================================================

function formatDuration(ms) {

  const totalSeconds =
    Math.floor(ms / 1000);

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  return (
    minutes +
    ":" +
    String(seconds).padStart(2, "0")
  );
}

// =====================================================
// INICIAR SERVIDOR
// =====================================================

app.listen(PORT, () => {

  console.log("=================================");
  console.log("MUSIC STATION SPOTIFY SERVER");
  console.log("=================================");
  console.log("Porta:", PORT);
  console.log("Servidor iniciado.");
  console.log("Redirect URI:", REDIRECT_URI);
  console.log("=================================");

});
