const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const PORT = process.env.PORT || 10000;

const CLIENT_ID =
  process.env.SPOTIFY_CLIENT_ID;

const CLIENT_SECRET =
  process.env.SPOTIFY_CLIENT_SECRET;

const REDIRECT_URI =
  process.env.SPOTIFY_REDIRECT_URI ||
  "https://music-station-255y.onrender.com/callback";

// =====================================================
// REFRESH TOKEN
// =====================================================
//
// IMPORTANTE:
// Depois do primeiro login, coloque o refresh token
// nas Environment Variables do Render:
//
// SPOTIFY_REFRESH_TOKEN
//
// Assim o token não desaparece quando o Render reinicia.
//

const SAVED_REFRESH_TOKEN =
  process.env.SPOTIFY_REFRESH_TOKEN || "";

// =====================================================
// SCOPES SPOTIFY
// =====================================================

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

  refreshToken:
    SAVED_REFRESH_TOKEN || null,

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

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

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
// LOGIN SPOTIFY
// =====================================================

app.get("/login", (req, res) => {

  if (!CLIENT_ID) {

    return res.status(500).send(
      "ERRO: SPOTIFY_CLIENT_ID não configurado."
    );

  }

  const state =
    crypto
      .randomBytes(16)
      .toString("hex");

  states.set(
    state,
    Date.now()
  );

  const params =
    new URLSearchParams({

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

  console.log(
    "Redirecionando para Spotify..."
  );

  res.redirect(
    spotifyURL
  );

});

// =====================================================
// CALLBACK SPOTIFY
// =====================================================

app.get(
  "/callback",
  async (req, res) => {

    const {
      code,
      state,
      error
    } = req.query;

    console.log(
      "================================="
    );

    console.log(
      "CALLBACK SPOTIFY"
    );

    console.log(
      "================================="
    );

    // -------------------------------------------------
    // ERRO DO SPOTIFY
    // -------------------------------------------------

    if (error) {

      return res
        .status(400)
        .send(`
<h1>❌ Autorização recusada</h1>

<p>
${escapeHtml(error)}
</p>
`);

    }

    // -------------------------------------------------
    // CODE
    // -------------------------------------------------

    if (!code) {

      return res
        .status(400)
        .send(`
<h1>❌ Código não recebido</h1>

<p>
O Spotify não enviou o código de autorização.
</p>
`);

    }

    // -------------------------------------------------
    // STATE
    // -------------------------------------------------

    if (
      !state ||
      !states.has(state)
    ) {

      return res
        .status(400)
        .send(`
<h1>❌ State inválido</h1>

<p>
Tente fazer o login novamente.
</p>
`);

    }

    states.delete(state);

    // -------------------------------------------------
    // CONFIGURAÇÃO
    // -------------------------------------------------

    if (
      !CLIENT_ID ||
      !CLIENT_SECRET
    ) {

      return res
        .status(500)
        .send(`
<h1>❌ Configuração incompleta</h1>

<p>
Configure:
</p>

<p>
SPOTIFY_CLIENT_ID
</p>

<p>
SPOTIFY_CLIENT_SECRET
</p>

`);

    }

    try {

      // =================================================
      // TROCAR CODE POR TOKEN
      // =================================================

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

                Buffer
                  .from(
                    CLIENT_ID +
                    ":" +
                    CLIENT_SECRET
                  )
                  .toString("base64")

            }

          }

        );

      // =================================================
      // ACCESS TOKEN
      // =================================================

      spotify.accessToken =
        tokenResponse
          .data
          .access_token;

      // =================================================
      // REFRESH TOKEN
      // =================================================
      //
      // Se o Spotify mandar um novo refresh token,
      // usamos ele.
      //
      // Caso não mande, mantemos o anterior.
      //

      if (
        tokenResponse
          .data
          .refresh_token
      ) {

        spotify.refreshToken =
          tokenResponse
            .data
            .refresh_token;

        console.log(
          "✅ Novo refresh token recebido."
        );

        console.log(
          "⚠️ Se este token for diferente do salvo " +
          "no Render, atualize SPOTIFY_REFRESH_TOKEN."
        );

      }

      // =================================================
      // EXPIRAÇÃO
      // =================================================

      spotify.expiresAt =
        Date.now() +

        (
          tokenResponse
            .data
            .expires_in *
          1000
        );

      console.log(
        "================================="
      );

      console.log(
        "✅ SPOTIFY CONECTADO!"
      );

      console.log(
        "Access Token:",
        spotify.accessToken
          ? "SIM"
          : "NÃO"
      );

      console.log(
        "Refresh Token:",
        spotify.refreshToken
          ? "SIM"
          : "NÃO"
      );

      console.log(
        "================================="
      );

      // =================================================
      // PEGAR MÚSICA
      // =================================================

      const musica =
        await getCurrentMusic();

      // =================================================
      // PÁGINA
      // =================================================

      res.send(`

<!DOCTYPE html>

<html lang="pt-BR">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
>

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
  alt="Capa"
>

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
Nenhuma música está tocando neste momento.
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

    }

    catch (error) {

      console.error(
        "ERRO NO CALLBACK:",

        error.response?.data ||
        error.message
      );

      res
        .status(500)
        .send(`

<h1>
❌ Erro ao conectar ao Spotify
</h1>

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

  }
);

// =====================================================
// API PARA ESP32
// =====================================================

app.get(
  "/api/music",
  async (req, res) => {

    try {

      // =================================================
      // SE NÃO TEM ACCESS TOKEN
      // =================================================

      if (
        !spotify.accessToken
      ) {

        // =================================================
        // TENTA RECUPERAR USANDO REFRESH TOKEN
        // =================================================

        if (
          spotify.refreshToken
        ) {

          console.log(
            "Access token ausente."
          );

          console.log(
            "Tentando recuperar Spotify..."
          );

          await refreshAccessToken();

        }

      }

      // =================================================
      // AINDA SEM TOKEN
      // =================================================

      if (
        !spotify.accessToken
      ) {

        return res
          .status(401)
          .json({

            conectado: false,

            erro:
              "Spotify não conectado",

            login:
              "/login"

          });

      }

      // =================================================
      // MÚSICA
      // =================================================

      const musica =
        await getCurrentMusic();

      // =================================================
      // RESPOSTA
      // =================================================

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

      res
        .status(500)
        .json({

          conectado: false,

          erro:
            "Erro ao consultar Spotify"

        });

    }

  }
);

// =====================================================
// MÚSICA ATUAL
// =====================================================

async function getCurrentMusic() {

  // ---------------------------------------------------
  // GARANTE TOKEN
  // ---------------------------------------------------

  await ensureToken();

  if (
    !spotify.accessToken
  ) {

    return null;

  }

  // ---------------------------------------------------
  // CONSULTA SPOTIFY
  // ---------------------------------------------------

  const response =
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

  if (
    response.status === 401
  ) {

    console.log(
      "Access token expirado."
    );

    await refreshAccessToken();

    if (
      !spotify.accessToken
    ) {

      return null;

    }

    return getCurrentMusic();

  }

  // ---------------------------------------------------
  // SEM MÚSICA
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

  if (
    response.status !== 200
  ) {

    throw new Error(
      "Spotify HTTP " +
      response.status
    );

  }

  // ---------------------------------------------------
  // ITEM
  // ---------------------------------------------------

  const item =
    response.data.item;

  // ---------------------------------------------------
  // RETORNO
  // ---------------------------------------------------

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

  // ---------------------------------------------------
  // NÃO TEM ACCESS TOKEN
  // ---------------------------------------------------

  if (
    !spotify.accessToken
  ) {

    if (
      spotify.refreshToken
    ) {

      await refreshAccessToken();

    }

    return;

  }

  // ---------------------------------------------------
  // RENOVA 1 MINUTO ANTES
  // ---------------------------------------------------

  if (

    Date.now() >=
    spotify.expiresAt - 60000

  ) {

    console.log(
      "Token próximo de expirar."
    );

    await refreshAccessToken();

  }

}

// =====================================================
// RENOVAR ACCESS TOKEN
// =====================================================

async function refreshAccessToken() {

  // ---------------------------------------------------
  // SEM REFRESH TOKEN
  // ---------------------------------------------------

  if (
    !spotify.refreshToken
  ) {

    console.log(
      "❌ Não existe refresh token."
    );

    return;

  }

  // ---------------------------------------------------
  // TENTA RENOVAR
  // ---------------------------------------------------

  try {

    console.log(
      "🔄 Renovando token Spotify..."
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

              Buffer
                .from(
                  CLIENT_ID +
                  ":" +
                  CLIENT_SECRET
                )
                .toString("base64")

          }

        }

      );

    // =================================================
    // NOVO ACCESS TOKEN
    // =================================================

    spotify.accessToken =
      response.data.access_token;

    // =================================================
    // NOVA EXPIRAÇÃO
    // =================================================

    spotify.expiresAt =
      Date.now() +

      (
        response
          .data
          .expires_in *
        1000
      );

    // =================================================
    // NOVO REFRESH TOKEN
    // =================================================

    if (
      response
        .data
        .refresh_token
    ) {

      spotify.refreshToken =
        response
          .data
          .refresh_token;

      console.log(
        "⚠️ Spotify forneceu um novo refresh token."
      );

      console.log(
        "Atualize SPOTIFY_REFRESH_TOKEN no Render."
      );

    }

    console.log(
      "✅ Token Spotify renovado."
    );

  }

  catch (error) {

    console.error(
      "❌ ERRO AO RENOVAR TOKEN:",

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

  if (
    !ms
  ) {

    return "0:00";

  }

  const totalSeconds =
    Math.floor(
      ms / 1000
    );

  const minutes =
    Math.floor(
      totalSeconds / 60
    );

  const seconds =
    totalSeconds % 60;

  return (

    minutes +
    ":" +
    String(seconds)
      .padStart(2, "0")

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
      "Redirect URI:",
      REDIRECT_URI
    );

    console.log(
      "Refresh Token salvo:",
      spotify.refreshToken
        ? "SIM"
        : "NÃO"
    );

    console.log(
      "================================="
    );

  }
);
