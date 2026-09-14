const http = require("http");
const { URL } = require("url");

const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const REDIRECT_URI =
  "https://station-255y.onrender.com/callback";

let accessToken = null;
let refreshToken = null;
let tokenExpiration = 0;


// =====================================================
// JSON
// =====================================================

function enviarJSON(res, codigo, dados) {
  res.writeHead(codigo, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-cache"
  });

  res.end(JSON.stringify(dados));
}


// =====================================================
// RENOVAR TOKEN
// =====================================================

async function renovarToken() {

  if (!refreshToken) {
    throw new Error("Spotify ainda não foi conectado.");
  }

  const credenciais = Buffer
    .from(CLIENT_ID + ":" + CLIENT_SECRET)
    .toString("base64");

  const resposta = await fetch(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",

      headers: {
        "Authorization": "Basic " + credenciais,
        "Content-Type":
          "application/x-www-form-urlencoded"
      },

      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken
      }).toString()
    }
  );

  if (!resposta.ok) {
    const erro = await resposta.text();
    throw new Error(
      "Erro ao renovar Spotify: " +
      resposta.status +
      " " +
      erro
    );
  }

  const dados = await resposta.json();

  accessToken = dados.access_token;

  tokenExpiration =
    Date.now() +
    ((dados.expires_in - 60) * 1000);

  return accessToken;
}


// =====================================================
// TOKEN DO USUÁRIO
// =====================================================

async function obterTokenUsuario() {

  if (
    accessToken &&
    Date.now() < tokenExpiration
  ) {
    return accessToken;
  }

  return await renovarToken();
}


// =====================================================
// LOGIN
// =====================================================

function paginaLogin() {

  const parametros = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,

    scope:
      "user-read-currently-playing user-read-playback-state"
  });

  return `
<!DOCTYPE html>

<html>

<head>
<meta charset="UTF-8">
<title>Music Station</title>
</head>

<body style="
background:#111;
color:white;
font-family:Arial;
text-align:center;
padding-top:80px;
">

<h1>🎵 Music Station</h1>

<p>Conecte seu Spotify</p>

<a
href="https://accounts.spotify.com/authorize?${parametros.toString()}"
style="
display:inline-block;
padding:18px 30px;
background:#1DB954;
color:white;
text-decoration:none;
border-radius:30px;
font-size:20px;
">

Entrar com Spotify

</a>

</body>

</html>
`;
}


// =====================================================
// TROCAR CÓDIGO POR TOKEN
// =====================================================

async function trocarCodigo(code) {

  const credenciais = Buffer
    .from(CLIENT_ID + ":" + CLIENT_SECRET)
    .toString("base64");

  const resposta = await fetch(
    "https://accounts.spotify.com/api/token",
    {
      method: "POST",

      headers: {
        "Authorization": "Basic " + credenciais,
        "Content-Type":
          "application/x-www-form-urlencoded"
      },

      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI
      }).toString()
    }
  );

  if (!resposta.ok) {

    const erro = await resposta.text();

    throw new Error(
      "Erro no login Spotify: " +
      resposta.status +
      " " +
      erro
    );
  }

  const dados = await resposta.json();

  accessToken = dados.access_token;

  refreshToken = dados.refresh_token;

  tokenExpiration =
    Date.now() +
    ((dados.expires_in - 60) * 1000);
}


// =====================================================
// MÚSICA TOCANDO
// =====================================================

async function obterMusicaAtual() {

  let token = await obterTokenUsuario();

  let resposta = await fetch(
    "https://api.spotify.com/v1/me/player/currently-playing",
    {
      headers: {
        "Authorization":
          "Bearer " + token
      }
    }
  );


  // TOKEN EXPIRADO
  if (resposta.status === 401) {

    token = await renovarToken();

    resposta = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      {
        headers: {
          "Authorization":
            "Bearer " + token
        }
      }
    );
  }


  // NADA TOCANDO
  if (resposta.status === 204) {

    return {
      conectado: true,
      tocando: false
    };
  }


  if (!resposta.ok) {

    const erro = await resposta.text();

    throw new Error(
      "Erro Spotify: " +
      resposta.status +
      " " +
      erro
    );
  }


  const dados = await resposta.json();


  if (!dados || !dados.item) {

    return {
      conectado: true,
      tocando: false
    };
  }


  const musica = dados.item;


  // ===================================================
  // CAPA
  // ===================================================

  let capa = "";

  if (
    musica.album &&
    musica.album.images &&
    musica.album.images.length > 0
  ) {

    capa =
      musica.album.images[0].url;
  }


  // ===================================================
  // ARTISTA
  // ===================================================

  let artista = "";

  if (musica.artists) {

    artista =
      musica.artists
        .map(a => a.name)
        .join(", ");
  }


  // ===================================================
  // RESULTADO
  // ===================================================

  return {

    conectado: true,

    tocando:
      dados.is_playing === true,

    titulo:
      musica.name || "",

    artista:
      artista,

    album:
      musica.album
        ? musica.album.name
        : "",

    duracao:
      musica.duration_ms || 0,

    capa:
      capa,

    progresso:
      dados.progress_ms || 0,

    spotify:
      musica.external_urls &&
      musica.external_urls.spotify
        ? musica.external_urls.spotify
        : ""
  };
}


// =====================================================
// SERVIDOR
// =====================================================

const servidor = http.createServer(
  async (req, res) => {

    try {

      const url = new URL(
        req.url,
        "http://" + req.headers.host
      );


      // =================================================
      // INÍCIO
      // =================================================

      if (url.pathname === "/") {

        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8"
        });

        res.end(`
<!DOCTYPE html>

<html>

<head>
<meta charset="UTF-8">
<title>Music Station</title>
</head>

<body style="
background:#111;
color:white;
font-family:Arial;
text-align:center;
padding:40px;
">

<h1>🎵 Music Station</h1>

<p>Servidor funcionando!</p>

<p>
<a
href="/login"
style="
color:#1DB954;
font-size:22px;
">
Entrar com Spotify
</a>
</p>

</body>

</html>
`);

        return;
      }


      // =================================================
      // LOGIN
      // =================================================

      if (url.pathname === "/login") {

        if (!CLIENT_ID || !CLIENT_SECRET) {

          enviarJSON(res, 500, {
            erro:
              "CLIENT_ID ou CLIENT_SECRET não configurado no Render."
          });

          return;
        }

        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8"
        });

        res.end(paginaLogin());

        return;
      }


      // =================================================
      // CALLBACK
      // =================================================

      if (url.pathname === "/callback") {

        const code =
          url.searchParams.get("code");

        const erro =
          url.searchParams.get("error");


        if (erro) {

          enviarJSON(res, 400, {
            erro:
              "Spotify recusou a autorização.",
            detalhe:
              erro
          });

          return;
        }


        if (!code) {

          enviarJSON(res, 400, {
            erro:
              "Código do Spotify não recebido."
          });

          return;
        }


        await trocarCodigo(code);


        res.writeHead(200, {
          "Content-Type":
            "text/html; charset=utf-8"
        });

        res.end(`
<!DOCTYPE html>

<html>

<head>
<meta charset="UTF-8">
</head>

<body style="
background:#111;
color:white;
font-family:Arial;
text-align:center;
padding-top:80px;
">

<h1>✅ Spotify conectado!</h1>

<p>
Agora abra:
</p>

<p>
<a
href="/nowplaying"
style="
color:#1DB954;
font-size:22px;
">
Ver música atual
</a>
</p>

</body>

</html>
`);

        return;
      }


      // =================================================
      // NOW PLAYING
      // =================================================

      if (url.pathname === "/nowplaying") {

        const musica =
          await obterMusicaAtual();

        enviarJSON(
          res,
          200,
          musica
        );

        return;
      }


      // =================================================
      // ROTA INEXISTENTE
      // =================================================

      enviarJSON(
        res,
        404,
        {
          erro:
            "Rota não encontrada."
        }
      );

    }

    catch (erro) {

      console.error(erro);

      enviarJSON(
        res,
        500,
        {
          erro:
            "Erro interno.",
          detalhe:
            erro.message
        }
      );
    }
  }
);


// =====================================================
// INICIAR
// =====================================================

servidor.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "================================"
    );

    console.log(
      "MUSIC STATION"
    );

    console.log(
      "Servidor iniciado."
    );

    console.log(
      "Porta:",
      PORT
    );

    console.log(
      "================================"
    );
  }
);
