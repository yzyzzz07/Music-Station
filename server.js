const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const REDIRECT_URI =
    process.env.SPOTIFY_REDIRECT_URI ||
    "https://music-station-255y.onrender.com/callback";

// =====================================================
// TOKENS
// =====================================================

let accessToken = null;
let tokenExpiration = 0;

// O refresh token será colocado no Render depois
let refreshToken =
    process.env.SPOTIFY_REFRESH_TOKEN || null;

// Estado de segurança do login
let loginState = null;

// =====================================================
// RESPOSTA JSON
// =====================================================

function enviarJSON(resposta, codigo, dados) {

    resposta.writeHead(codigo, {
        "Content-Type":
            "application/json; charset=utf-8",

        "Access-Control-Allow-Origin":
            "*",

        "Cache-Control":
            "no-cache"
    });

    resposta.end(
        JSON.stringify(dados)
    );
}

// =====================================================
// PEGAR TOKEN USANDO REFRESH TOKEN
// =====================================================

async function renovarToken() {

    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error(
            "SPOTIFY_CLIENT_ID ou SPOTIFY_CLIENT_SECRET não configurado."
        );
    }

    if (!refreshToken) {
        throw new Error(
            "Spotify ainda não foi autorizado. Acesse /login primeiro."
        );
    }

    const credenciais =
        Buffer
            .from(
                CLIENT_ID +
                ":" +
                CLIENT_SECRET
            )
            .toString("base64");

    const resposta =
        await fetch(
            "https://accounts.spotify.com/api/token",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        "Basic " +
                        credenciais,

                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        grant_type:
                            "refresh_token",

                        refresh_token:
                            refreshToken
                    }).toString()
            }
        );

    const dados =
        await resposta.json();

    if (!resposta.ok) {

        refreshToken = null;
        accessToken = null;

        throw new Error(
            "Token Spotify inválido ou expirado."
        );
    }

    accessToken =
        dados.access_token;

    tokenExpiration =
        Date.now() +
        ((dados.expires_in - 60) * 1000);

    // Em alguns casos o Spotify devolve
    // um novo refresh token
    if (dados.refresh_token) {
        refreshToken =
            dados.refresh_token;
    }

    return accessToken;
}

// =====================================================
// PEGAR ACCESS TOKEN
// =====================================================

async function obterToken() {

    if (
        accessToken &&
        Date.now() < tokenExpiration
    ) {
        return accessToken;
    }

    return await renovarToken();
}

// =====================================================
// LOGIN SPOTIFY
// =====================================================

function iniciarLogin(resposta) {

    loginState =
        crypto
            .randomBytes(16)
            .toString("hex");

    const parametros =
        new URLSearchParams({
            client_id:
                CLIENT_ID,

            response_type:
                "code",

            redirect_uri:
                REDIRECT_URI,

            scope:
                "user-read-currently-playing",

            state:
                loginState
        });

    const url =
        "https://accounts.spotify.com/authorize?" +
        parametros.toString();

    resposta.writeHead(
        302,
        {
            Location: url
        }
    );

    resposta.end();
}

// =====================================================
// CALLBACK SPOTIFY
// =====================================================

async function callbackSpotify(
    url,
    resposta
) {

    const code =
        url.searchParams.get("code");

    const state =
        url.searchParams.get("state");

    const erro =
        url.searchParams.get("error");

    if (erro) {

        resposta.writeHead(
            400,
            {
                "Content-Type":
                    "text/html; charset=utf-8"
            }
        );

        resposta.end(
            "<h2>Login Spotify cancelado.</h2>"
        );

        return;
    }

    if (
        !code ||
        !state ||
        state !== loginState
    ) {

        resposta.writeHead(
            400,
            {
                "Content-Type":
                    "text/html; charset=utf-8"
            }
        );

        resposta.end(
            "<h2>Erro de segurança no login.</h2>"
        );

        return;
    }

    loginState = null;

    const credenciais =
        Buffer
            .from(
                CLIENT_ID +
                ":" +
                CLIENT_SECRET
            )
            .toString("base64");

    const tokenResponse =
        await fetch(
            "https://accounts.spotify.com/api/token",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        "Basic " +
                        credenciais,

                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    new URLSearchParams({
                        grant_type:
                            "authorization_code",

                        code:
                            code,

                        redirect_uri:
                            REDIRECT_URI
                    }).toString()
            }
        );

    const dados =
        await tokenResponse.json();

    if (!tokenResponse.ok) {

        throw new Error(
            "Erro ao obter token: " +
            JSON.stringify(dados)
        );
    }

    accessToken =
        dados.access_token;

    tokenExpiration =
        Date.now() +
        ((dados.expires_in - 60) * 1000);

    refreshToken =
        dados.refresh_token;

    console.log(
        "================================"
    );

    console.log(
        "SPOTIFY AUTORIZADO!"
    );

    console.log(
        "Refresh Token recebido."
    );

    console.log(
        "================================"
    );

    resposta.writeHead(
        200,
        {
            "Content-Type":
                "text/html; charset=utf-8"
        }
    );

    resposta.end(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Music Station</title>
</head>

<body style="
font-family:Arial;
padding:30px;
background:#111;
color:white;
">

<h1>Spotify conectado! ✅</h1>

<p>Agora o servidor já consegue consultar a música atual.</p>

<p>
Para deixar permanente no Render, copie o Refresh Token abaixo
e coloque como variável:
</p>

<h3>SPOTIFY_REFRESH_TOKEN</h3>

<textarea
style="width:100%;height:100px;font-size:14px;"
readonly>${refreshToken}</textarea>

<p>
Depois coloque esse valor nas Environment Variables do Render.
</p>

<p>
Teste depois:
</p>

<a
href="/now-playing"
style="color:#1DB954;font-size:20px;"
>
Ver música atual
</a>

</body>
</html>
`);
}

// =====================================================
// MÚSICA ATUAL DO SPOTIFY
// =====================================================

async function obterMusicaAtual() {

    const token =
        await obterToken();

    const resposta =
        await fetch(
            "https://api.spotify.com/v1/me/player/currently-playing",
            {
                headers: {
                    "Authorization":
                        "Bearer " +
                        token
                }
            }
        );

    // 204 = nada tocando
    if (resposta.status === 204) {

        return {
            tocando: false
        };
    }

    if (!resposta.ok) {

        const erro =
            await resposta.text();

        throw new Error(
            "Erro Spotify: " +
            resposta.status +
            " " +
            erro
        );
    }

    const dados =
        await resposta.json();

    if (
        !dados ||
        !dados.item
    ) {

        return {
            tocando: false
        };
    }

    const musica =
        dados.item;

    // =================================================
    // CAPA
    // =================================================

    let capa = "";

    if (
        musica.album &&
        musica.album.images &&
        musica.album.images.length > 0
    ) {

        capa =
            musica.album.images[0].url;
    }

    // =================================================
    // ARTISTA
    // =================================================

    let artista = "";

    if (
        musica.artists &&
        musica.artists.length > 0
    ) {

        artista =
            musica.artists
                .map(
                    a => a.name
                )
                .join(", ");
    }

    // =================================================
    // RESULTADO
    // =================================================

    return {

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

        spotify:
            musica.external_urls &&
            musica.external_urls.spotify
                ? musica.external_urls.spotify
                : ""
    };
}

// =====================================================
// BUSCAR MÚSICA PELO NOME
// =====================================================

async function buscarMusica(
    titulo,
    artista
) {

    const token =
        await obterToken();

    const consulta =
        titulo +
        " " +
        artista;

    const url =
        "https://api.spotify.com/v1/search" +
        "?q=" +
        encodeURIComponent(consulta) +
        "&type=track" +
        "&limit=1" +
        "&market=BR";

    const resposta =
        await fetch(
            url,
            {
                headers: {
                    "Authorization":
                        "Bearer " +
                        token
                }
            }
        );

    if (!resposta.ok) {

        throw new Error(
            "Erro na busca Spotify: " +
            resposta.status
        );
    }

    const dados =
        await resposta.json();

    if (
        !dados.tracks ||
        !dados.tracks.items ||
        dados.tracks.items.length === 0
    ) {

        return null;
    }

    const musica =
        dados.tracks.items[0];

    let capa = "";

    if (
        musica.album &&
        musica.album.images &&
        musica.album.images.length > 0
    ) {

        capa =
            musica.album.images[0].url;
    }

    return {

        titulo:
            musica.name,

        artista:
            musica.artists
                .map(
                    a => a.name
                )
                .join(", "),

        album:
            musica.album
                ? musica.album.name
                : "",

        duracao:
            musica.duration_ms || 0,

        capa:
            capa,

        spotify:
            musica.external_urls
                ? musica.external_urls.spotify
                : ""
    };
}

// =====================================================
// SERVIDOR
// =====================================================

const servidor =
    http.createServer(
        async (
            requisicao,
            resposta
        ) => {

            try {

                const url =
                    new URL(
                        requisicao.url,
                        "http://" +
                        requisicao.headers.host
                    );

                // =====================================
                // PRINCIPAL
                // =====================================

                if (
                    url.pathname === "/"
                ) {

                    enviarJSON(
                        resposta,
                        200,
                        {
                            status:
                                "Music Station Spotify Server",

                            funcionando:
                                true,

                            rotas: [
                                "/login",
                                "/now-playing",
                                "/music"
                            ]
                        }
                    );

                    return;
                }

                // =====================================
                // LOGIN
                // =====================================

                if (
                    url.pathname === "/login"
                ) {

                    iniciarLogin(
                        resposta
                    );

                    return;
                }

                // =====================================
                // CALLBACK
                // =====================================

                if (
                    url.pathname === "/callback"
                ) {

                    await callbackSpotify(
                        url,
                        resposta
                    );

                    return;
                }

                // =====================================
                // MÚSICA ATUAL
                // =====================================

                if (
                    url.pathname === "/now-playing"
                ) {

                    const musica =
                        await obterMusicaAtual();

                    enviarJSON(
                        resposta,
                        200,
                        musica
                    );

                    return;
                }

                // =====================================
                // BUSCA ANTIGA
                // =====================================

                if (
                    url.pathname === "/music"
                ) {

                    const titulo =
                        (
                            url.searchParams.get(
                                "titulo"
                            ) || ""
                        ).trim();

                    const artista =
                        (
                            url.searchParams.get(
                                "artista"
                            ) || ""
                        ).trim();

                    if (!titulo) {

                        enviarJSON(
                            resposta,
                            400,
                            {
                                erro:
                                    "Titulo não informado."
                            }
                        );

                        return;
                    }

                    const resultado =
                        await buscarMusica(
                            titulo,
                            artista
                        );

                    if (!resultado) {

                        enviarJSON(
                            resposta,
                            404,
                            {
                                erro:
                                    "Musica não encontrada."
                            }
                        );

                        return;
                    }

                    enviarJSON(
                        resposta,
                        200,
                        resultado
                    );

                    return;
                }

                // =====================================
                // ROTA NÃO ENCONTRADA
                // =====================================

                enviarJSON(
                    resposta,
                    404,
                    {
                        erro:
                            "Rota não encontrada."
                    }
                );
            }

            catch (erro) {

                console.error(
                    erro
                );

                enviarJSON(
                    resposta,
                    500,
                    {
                        erro:
                            erro.message
                    }
                );
            }
        }
    );

// =====================================================
// INICIAR SERVIDOR
// =====================================================

servidor.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================"
        );

        console.log(
            "MUSIC STATION SPOTIFY SERVER"
        );

        console.log(
            "================================"
        );

        console.log(
            "Porta:",
            PORT
        );

        console.log(
            "Servidor iniciado."
        );

        console.log(
            "Login:",
            REDIRECT_URI.replace(
                "/callback",
                "/login"
            )
        );
    }
);
