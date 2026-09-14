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

// IMPORTANTE:
// Depois do primeiro login, coloque o Refresh Token
// como variável SPOTIFY_REFRESH_TOKEN no Render.

const ENV_REFRESH_TOKEN =
  process.env.SPOTIFY_REFRESH_TOKEN || null;

const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-read-private",
  "user-read-email"
].join(" ");


// =====================================================
// ESTADO DO SPOTIFY
// =====================================================

const states = new Map();

let spotify = {
  accessToken: null,
  refreshToken: ENV_REFRESH_TOKEN,
  expiresAt: 0
};


// =====================================================
// PÁGINA INICIAL
// =====================================================

app.get("/", (req, res) => {

  const conectado =
    spotify.accessToken !== null ||
    spotify.refreshToken !== null;

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

.ok {
  color: #159447;
}

.info {
  margin-top: 25px;
}

</style>

</head>

<body>

<h1>🎵 Music Station</h1>

<p class="ok">
  ${conectado
    ? "Spotify configurado"
    : "Spotify ainda não conectado"}
</p>

<a href="/login">
  Conectar Spotify
</a>

<div class="info">

<p>
O ESP32 usa:
</p>

<p>
<b>/api/music</b>
</p>

<p>
A API funciona automaticamente.
</p>

</div>

</body>
</html>
  `);
});


// =====================================================
// LOGIN SPOTIFY
// =====================================================

app.get("/login", (req, res) => {

  if (!CLIENT_ID) {

    return res.status(500).send(
      "SPOTIFY_CLIENT_ID não configurado."
    );

  }

  const state =
    crypto.randomBytes(16).toString("hex");

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

  res.redirect(spotifyURL);
});


// =====================================================
// CALLBACK
// =====================================================

app.get("/callback", async (req, res) => {

  const {
    code,
    state,
    error
  } = req.query;


  if (error) {

    return res.status(400).send(`
      <h1>Autorização recusada</h1>
      <p>${escapeHtml(error)}</p>
    `);

  }


  if (!code) {

    return res.status(400).send(
      "Código do Spotify não recebido."
    );

  }


  if (!state || !states.has(state)) {

    return res.status(400).send(
      "State inválido."
    );

  }


  states.delete(state);


  if (!CLIENT_ID || !CLIENT_SECRET) {

    return res.status(500).send(
      "CLIENT_ID ou CLIENT_SECRET não configurado."
    );

  }


  try {

    // -------------------------------------------------
    // TROCAR CODE POR TOKEN
    // -------------------------------------------------

    const tokenResponse =
      await axios.post(

        "https://accounts.spotify.com/api/token",

        new URLSearchParams({

          grant_type:
            "authorization_code",

          code:
            code,

          redirect_uri:
            REDIRECT_URI

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
      tokenResponse.data.access_token;


    if (tokenResponse.data.refresh_token) {

      spotify.refreshToken =
        tokenResponse.data.refresh_token;

    }


    spotify.expiresAt =
      Date.now() +
      tokenResponse.data.expires_in * 1000;


    console.log(
      "Spotify conectado."
    );


    console.log(
      "Refresh Token recebido:",
      spotify.refreshToken
        ? "SIM"
        : "NÃO"
    );


    // -------------------------------------------------
    // MOSTRA O REFRESH TOKEN UMA ÚNICA VEZ
    // -------------------------------------------------

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
  font-family: Arial;
  padding: 25px;
  text-align: center;
}

.token {

  word-break: break-all;

  background: #eee;

  padding: 15px;

  border-radius: 10px;

  margin-top: 20px;

}

.ok {

  color: #159447;

}

</style>

</head>

<body>

<h1 class="ok">
Spotify conectado!
</h1>

<p>
O login funcionou.
</p>

<p>
Agora copie o <b>Refresh Token</b> abaixo.
</p>

<div class="token">

${escapeHtml(
  spotify.refreshToken || ""
)}

</div>

<p>
No Render, crie a variável:
</p>

<h3>
SPOTIFY_REFRESH_TOKEN
</h3>

<p>
Depois faça um novo deploy.
</p>

<p>
⚠️ Não coloque esse token no GitHub.
</p>

</body>

</html>

    `);

  }

  catch (error) {

    console.error(
      "ERRO NO CALLBACK:",
      error.response?.data ||
      error.message
    );

    res.status(500).send(`

<h1>Erro ao conectar Spotify</h1>

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
// API DO ESP32
// =====================================================

app.get("/api/music", async (req, res) => {

  try {

    // -------------------------------------------------
    // TENTA GARANTIR TOKEN
    // -------------------------------------------------

    await ensureToken();


    if (!spotify.accessToken) {

      return res.status(401).json({

        conectado: false,

        erro:
          "Spotify não conectado",

        login:
          "/login"

      });

    }


    // -------------------------------------------------
    // PEGA MÚSICA
    // -------------------------------------------------

    const musica =
      await getCurrentMusic();


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

  }

  catch (error) {

    console.error(
      "ERRO API:",
      error.response?.data ||
      error.message
    );

    res.status(500).json({

      conectado: false,

      erro:
        "Erro ao consultar Spotify"

    });

  }

});


// =====================================================
// MÚSICA ATUAL
// =====================================================

async function getCurrentMusic() {

  await ensureToken();


  if (!spotify.accessToken) {

    return null;

  }


  let response =
    await axios.get(

      "https://api.spotify.com/v1/me/player/currently-playing",

      {

        headers: {

          Authorization:
            "Bearer " +
            spotify.accessToken

        },

        validateStatus:
          () => true

      }

    );


  // ---------------------------------------------------
  // TOKEN EXPIRADO
  // ---------------------------------------------------

  if (response.status === 401) {

    console.log(
      "Token expirado. Renovando..."
    );

    await refreshAccessToken();


    if (!spotify.accessToken) {

      return null;

    }


    response =
      await axios.get(

        "https://api.spotify.com/v1/me/player/currently-playing",

        {

          headers: {

            Authorization:
              "Bearer " +
              spotify.accessToken

          },

          validateStatus:
            () => true

        }

      );

  }


  // ---------------------------------------------------
  // NENHUMA MÚSICA
  // ---------------------------------------------------

  if (

    response.status === 204 ||

    !response.data ||

    !response.data.item

  ) {

    return null;

  }


  // ---------------------------------------------------
  // OUTRO ERRO
  // ---------------------------------------------------

  if (response.status !== 200) {

    throw new Error(
      "Spotify HTTP " +
      response.status
    );

  }


  const item =
    response.data.item;


  return {

    nome:
      item.name || "",


    artista:
      item.artists
        ? item.artists
            .map(
              artist =>
                artist.name
            )
            .join(", ")
        : "",


    album:
      item.album
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
// GARANTIR TOKEN
// =====================================================

async function ensureToken() {

  // Token ainda válido
  if (

    spotify.accessToken &&

    Date.now() <
      spotify.expiresAt - 60000

  ) {

    return;

  }


  // Tem refresh token?
  if (spotify.refreshToken) {

    await refreshAccessToken();

  }

}


// =====================================================
// RENOVAR TOKEN
// =====================================================

async function refreshAccessToken() {

  if (!spotify.refreshToken) {

    console.log(
      "Nenhum Refresh Token configurado."
    );

    return;

  }


  try {

    console.log(
      "Renovando token Spotify..."
    );


    const response =
      await axios.post(

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
      response.data.expires_in * 1000;


    // Spotify pode devolver
    // um novo refresh token

    if (
      response.data.refresh_token
    ) {

      spotify.refreshToken =
        response.data.refresh_token;

    }


    console.log(
      "Token Spotify renovado!"
    );

  }

  catch (error) {

    console.error(
      "ERRO AO RENOVAR TOKEN:",
      error.response?.data ||
      error.message
    );


    spotify.accessToken =
      null;

  }

}


// =====================================================
// DURAÇÃO
// =====================================================

function formatDuration(ms) {

  if (!ms) {

    return "0:00";

  }


  const totalSeconds =
    Math.floor(ms / 1000);


  const minutes =
    Math.floor(
      totalSeconds / 60
    );


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

  if (
    text === null ||
    text === undefined
  ) {

    return "";

  }


  return String(text)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}


// =====================================================
// SERVIDOR
// =====================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================="
    );

    console.log(
      "MUSIC STATION SPOTIFY SERVER"
    );

    console.log(
      "================================="
    );

    console.log(
      "Porta:",
      PORT
    );

    console.log(
      "Servidor iniciado."
    );

    console.log(
      "Refresh Token configurado:",
      spotify.refreshToken
        ? "SIM"
        : "NÃO"
    );

    console.log(
      "API:",
      "/api/music"
    );

    console.log(
      "================================="
    );

  }
);
