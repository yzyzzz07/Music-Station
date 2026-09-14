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

// Permissões que o Music Station precisa
const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-read-private",
  "user-read-email"
].join(" ");

// =====================================================
// SERVIDOR
// =====================================================

const appState = new Map();

// Página inicial
app.get("/", (req, res) => {
  res.json({
    status: "Music Station Spotify Server",
    funcionando: true,
    login: "/login",
    callback: "/callback"
  });
});

// =====================================================
// LOGIN SPOTIFY
// =====================================================

app.get("/login", (req, res) => {

  if (!CLIENT_ID) {
    return res.status(500).send(
      "ERRO: SPOTIFY_CLIENT_ID não foi configurado no Render."
    );
  }

  const state = crypto.randomBytes(16).toString("hex");

  appState.set(state, {
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
// CALLBACK DO SPOTIFY
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

  if (!state || !appState.has(state)) {
    return res.status(400).send(
      "Erro de segurança: state inválido."
    );
  }

  appState.delete(state);

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).send(
      "As credenciais do Spotify não foram configuradas no Render."
    );
  }

  try {

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

    console.log("Spotify conectado com sucesso!");

    // Busca informações da música atual
    const musicResponse = await axios.get(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          Authorization: "Bearer " + access_token
        }
      }
    );

    let musica = null;

    if (
      musicResponse.status === 200 &&
      musicResponse.data &&
      musicResponse.data.item
    ) {

      const item = musicResponse.data.item;

      musica = {
        nome: item.name,

        artista: item.artists
          .map(artist => artist.name)
          .join(", "),

        album: item.album.name,

        capa:
          item.album.images &&
          item.album.images.length > 0
            ? item.album.images[0].url
            : null,

        duracao_ms: item.duration_ms,

        progresso_ms:
          musicResponse.data.progress_ms || 0,

        tocando:
          musicResponse.data.is_playing || false
      };
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
            padding: 40px;
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
            margin-bottom: 5px;
          }

          p {
            font-size: 18px;
          }
        </style>
      </head>

      <body>

        <h1>Music Station conectado!</h1>

        ${
          musica
            ? `
              ${
                musica.capa
                  ? `<img src="${musica.capa}">`
                  : ""
              }

              <h1>${escapeHtml(musica.nome)}</h1>

              <p>
                ${escapeHtml(musica.artista)}
              </p>

              <p>
                Álbum: ${escapeHtml(musica.album)}
              </p>
            `
            : `
              <p>
                Spotify conectado, mas nenhuma música
                está tocando neste momento.
              </p>
            `
        }

        <p>
          O Music Station já conseguiu acessar sua conta Spotify.
        </p>

      </body>
      </html>
    `);

    console.log(
      "Access Token recebido:",
      access_token ? "SIM" : "NÃO"
    );

    console.log(
      "Refresh Token recebido:",
      refresh_token ? "SIM" : "NÃO"
    );

    console.log(
      "Expira em:",
      expires_in,
      "segundos"
    );

  } catch (error) {

    console.error(
      "ERRO SPOTIFY:",
      error.response?.data || error.message
    );

    res.status(500).send(`
      <h1>Erro ao conectar ao Spotify</h1>
      <pre>
${escapeHtml(
  JSON.stringify(
    error.response?.data || error.message,
    null,
    2
  )
)}
      </pre>
    `);
  }
});

// =====================================================
// FUNÇÃO PARA SEGURANÇA HTML
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
