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
  "user-read-playback-state",
  "user-read-private",
  "user-read-email"
].join(" ");

// =====================================================
// ESTADO
// =====================================================

const states = new Map();

let spotify = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0
};

// =====================================================
// PÁGINA INICIAL
// =====================================================

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport"
            content="width=device-width, initial-scale=1">
      <title>Music Station</title>

      <style>
        body {
          font-family: Arial, sans-serif;
          text-align: center;
          background: white;
          color: #111;
          padding: 40px 20px;
        }

        a {
          display: inline-block;
          margin-top: 20px;
          padding: 14px 24px;
          background: #1DB954;
          color: white;
          text-decoration: none;
          border-radius: 30px;
          font-weight: bold;
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

  if (!CLIENT_ID) {
    return res.status(500).send(
      "ERRO: SPOTIFY_CLIENT_ID não configurado."
    );
  }

  const state = crypto
    .randomBytes(16)
    .toString("hex");

  states.set(state, Date.now());

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

  console.log("=================================");
  console.log("CALLBACK SPOTIFY");
  console.log("=================================");

  if (error) {
    console.log("Spotify recusou:", error);

    return res.status(400).send(`
      <h1>❌ Autorização recusada</h1>
      <p>${escapeHtml(error)}</p>
    `);
  }

  if (!code) {
    return res.status(400).send(`
      <h1>❌ Código não recebido</h1>
      <p>O Spotify não enviou o código de autorização.</p>
    `);
  }

  if (!state || !states.has(state)) {
    return res.status(400).send(`
      <h1>❌ State inválido</h1>
      <p>Tente fazer o login novamente.</p>
    `);
  }

  states.delete(state);

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send(`
      <h1>❌ Configuração incompleta</h1>
      <p>Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no Render.</p>
    `);
  }

  try {

    // =================================================
    // TROCAR CODE POR TOKEN
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

    spotify.accessToken =
      tokenResponse.data.access_token;

    spotify.refreshToken =
      tokenResponse.data.refresh_token;

    spotify.expiresAt =
      Date.now() +
      (tokenResponse.data.expires_in * 1000);

    console.log("✅ Spotify conectado!");
    console.log(
      "Access Token:",
      spotify.accessToken ? "SIM" : "NÃO"
    );
    console.log(
      "Refresh Token:",
      spotify.refreshToken ? "SIM" : "NÃO"
    );

    // =================================================
    // PEGAR MÚSICA ATUAL
    // =================================================

    const musica = await getCurrentMusic();

    // =================================================
    // MOSTRAR RESULTADO
    // =================================================

    res.send(`
      <!DOCTYPE html>

      <html lang="pt-BR">

      <head>

        <meta charset="UTF-8">

        <meta name="viewport"
              content="width=device-width, initial-scale=1">

        <title>Music Station</title>

        <style>

          body {
            font-family: Arial, sans-serif;
            text-align: center;
            background: white;
            color: #111;
            padding: 30px 15px;
          }

          .ok {
            color: #159447;
          }

          img {
            width: 200px;
            height: 200px;
            object-fit: cover;
            border-radius: 12px;
            margin-top: 20px;
          }

          h1 {
            margin-bottom: 8px;
          }

          p {
            font-size: 18px;
          }

          .info {
            margin-top: 20px;
          }

          .api {
            margin-top: 30px;
            font-size: 14px;
            color: #666;
          }

        </style>

      </head>

      <body>

        <h1 class="ok">
          ✅ Spotify conectado!
        </h1>

        ${
          musica
            ? `

              ${
                musica.capa
                  ? `
                    <img
                      src="${escapeHtml(musica.capa)}"
                      alt="Capa">
                  `
                  : ""
              }

              <h1>
                ${escapeHtml(musica.nome)}
              </h1>

              <p>
                ${escapeHtml(musica.artista)}
              </p>

              <div class="info">

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
                      ? "▶️ Tocando agora"
                      : "⏸️ Pausada"
                  }
                </p>

              </div>

            `
            : `

              <p>
                Nenhuma música está tocando
                neste momento.
              </p>

            `
        }

        <div class="api">

          <p>
            Music Station API funcionando.
          </p>

          <p>
            O ESP32 poderá usar:
          </p>

          <p>
            <b>/api/music</b>
          </p>

        </div>

      </body>

      </html>
    `);

  } catch (error) {

    console.error(
      "ERRO NO CALLBACK:",
      error.response?.data ||
      error.message
    );

    res.status(500).send(`
      <h1>❌ Erro ao conectar ao Spotify</h1>

      <pre>
${escapeHtml(
  JSON.stringify(
    error.response?.data ||
    error.message,
    null,
    2
  )
)}
      </pre>
    `);
  }
});

// =====================================================
// API PARA O ESP32
// =====================================================

app.get("/api/music", async (req, res) => {

  try {

    if (!spotify.accessToken) {

      return res.status(401).json({
        conectado: false,
        erro: "Spotify não conectado",
        login: "/login"
      });

    }

    const musica = await getCurrentMusic();

    res.json({
      conectado: true,
      musica: musica
    });

  } catch (error) {

    console.error(
      "ERRO API:",
      error.response?.data ||
      error.message
    );

    res.status(500).json({
      conectado: false,
      erro: "Erro ao consultar Spotify"
    });
  }
});

// =====================================================
// PEGAR MÚSICA ATUAL
// =====================================================

async function getCurrentMusic() {

  // Atualiza token se estiver próximo de expirar
  await ensureToken();

  if (!spotify.accessToken) {
    return null;
  }

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

  // Spotify sem música atual
  if (
    response.status === 204 ||
    !response.data ||
    !response.data.item
  ) {

    return null;
  }

  // Token expirado
  if (response.status === 401) {

    await refreshAccessToken();

    if (!spotify.accessToken) {
      return null;
    }

    return getCurrentMusic();
  }

  if (response.status !== 200) {

    throw new Error(
      "Spotify HTTP " + response.status
    );
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

    tocando:
      response.data.is_playing === true

  };
}

// =====================================================
// RENOVAR TOKEN
// =====================================================

async function ensureToken() {

  if (!spotify.accessToken) {
    return;
  }

  // Renova 1 minuto antes de expirar
  if (
    Date.now() >=
    spotify.expiresAt - 60000
  ) {

    await refreshAccessToken();
  }
}

// =====================================================
// REFRESH TOKEN
// =====================================================

async function refreshAccessToken() {

  if (!spotify.refreshToken) {

    console.log(
      "Não existe refresh token."
    );

    return;
  }

  try {

    const response = await axios.post(

      "https://accounts.spotify.com/api/token",

      new URLSearchParams({

        grant_type:
          "refresh_token",

        refresh_token:
          spotify.refreshToken

      }).toString(),

      {

        headers: {

          "Content-Type":
            "application/x-www-form-urlencoded",

          "Authorization":
            "Basic " +
            Buffer.from(
              CLIENT_ID +
              ":" +
              CLIENT_SECRET
            ).toString("base64")
        }

      }

    );

    spotify.accessToken =
      response.data.access_token;

    spotify.expiresAt =
      Date.now() +
      (response.data.expires_in * 1000);

    // Spotify pode fornecer um novo refresh token
    if (response.data.refresh_token) {

      spotify.refreshToken =
        response.data.refresh_token;
    }

    console.log(
      "🔄 Token Spotify renovado."
    );

  } catch (error) {

    console.error(
      "ERRO AO RENOVAR TOKEN:",
      error.response?.data ||
      error.message
    );

    spotify.accessToken = null;
  }
}

// =====================================================
// FORMATA DURAÇÃO
// =====================================================

function formatDuration(ms) {

  if (!ms) {
    return "0:00";
  }

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
// SEGURANÇA HTML
// =====================================================

function escapeHtml(text) {

  if (text === null || text === undefined) {
    return "";
  }

  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =====================================================
// SERVIDOR
// =====================================================

app.listen(PORT, "0.0.0.0", () => {

  console.log("=================================");
  console.log("MUSIC STATION SPOTIFY SERVER");
  console.log("=================================");
  console.log("Porta:", PORT);
  console.log("Servidor iniciado.");
  console.log("Redirect URI:", REDIRECT_URI);
  console.log("=================================");

});
