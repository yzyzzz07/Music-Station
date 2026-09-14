const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const REDIRECT_URI =
  "https://music-station-255y.onrender.com/callback";

let accessToken = null;
let refreshToken = null;

function gerarState() {
  return crypto.randomBytes(16).toString("hex");
}

// =====================================================
// INÍCIO
// =====================================================

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Music Station</title>
      </head>
      <body style="font-family:Arial;text-align:center;padding:40px">
        <h1>🎵 Music Station</h1>
        <p>Servidor funcionando!</p>
        <a href="/login">
          <button style="font-size:20px;padding:15px 30px">
            Entrar com Spotify
          </button>
        </a>
      </body>
    </html>
  `);
});

// =====================================================
// LOGIN SPOTIFY
// =====================================================

app.get("/login", (req, res) => {

  console.log("LOGIN SOLICITADO");

  if (!CLIENT_ID) {
    return res.status(500).send(
      "ERRO: SPOTIFY_CLIENT_ID não configurado no Render."
    );
  }

  const state = gerarState();

  const scope = [
    "user-read-currently-playing",
    "user-read-playback-state",
    "user-read-private"
  ].join(" ");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    scope: scope,
    redirect_uri: REDIRECT_URI,
    state: state
  });

  const url =
    "https://accounts.spotify.com/authorize?" +
    params.toString();

  console.log("REDIRECIONANDO PARA SPOTIFY");

  res.redirect(url);
});

// =====================================================
// CALLBACK
// =====================================================

app.get("/callback", async (req, res) => {

  console.log("CALLBACK RECEBIDO");

  const code = req.query.code;

  if (req.query.error) {
    return res.send(
      "Spotify recusou a autorização: " + req.query.error
    );
  }

  if (!code) {
    return res.status(400).send(
      "Código de autorização não recebido."
    );
  }

  try {

    const resposta = await axios.post(
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

    accessToken = resposta.data.access_token;
    refreshToken = resposta.data.refresh_token;

    console.log("SPOTIFY AUTORIZADO!");

    res.send(`
      <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body style="font-family:Arial;text-align:center;padding:40px">
          <h1>✅ Spotify conectado!</h1>
          <p>Agora o Music Station pode acessar a música atual.</p>
        </body>
      </html>
    `);

  } catch (erro) {

    console.log(
      "ERRO SPOTIFY:",
      erro.response?.data || erro.message
    );

    res.status(500).send(
      "Erro ao conectar com o Spotify.<br><br>" +
      JSON.stringify(
        erro.response?.data || erro.message
      )
    );
  }
});

// =====================================================
// NOW PLAYING
// =====================================================

app.get("/nowplaying", async (req, res) => {

  if (!accessToken) {
    return res.json({
      conectado: false,
      mensagem: "Spotify não conectado"
    });
  }

  try {

    const resposta = await axios.get(
      "https://api.spotify.com/v1/me/player",
      {
        headers: {
          Authorization: "Bearer " + accessToken
        }
      }
    );

    if (!resposta.data || !resposta.data.item) {
      return res.json({
        conectado: true,
        tocando: false
      });
    }

    const musica = resposta.data.item;

    res.json({
      conectado: true,
      tocando: resposta.data.is_playing,
      nome: musica.name,
      artista: musica.artists
        .map(a => a.name)
        .join(", "),
      album: musica.album.name,
      capa:
        musica.album.images &&
        musica.album.images.length
          ? musica.album.images[0].url
          : null,
      duracao: musica.duration_ms,
      duracao_segundos:
        Math.floor(musica.duration_ms / 1000)
    });

  } catch (erro) {

    console.log(
      "ERRO NOW PLAYING:",
      erro.response?.data || erro.message
    );

    res.status(500).json({
      erro: "Erro ao consultar Spotify",
      detalhe:
        erro.response?.data || erro.message
    });
  }
});

// =====================================================
// SERVIDOR
// =====================================================

app.listen(PORT, "0.0.0.0", () => {

  console.log("==============================");
  console.log("MUSIC STATION SPOTIFY SERVER");
  console.log("==============================");
  console.log("Porta:", PORT);
  console.log("Servidor iniciado.");
  console.log("Redirect URI:", REDIRECT_URI);
});
