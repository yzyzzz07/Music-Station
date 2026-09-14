const http = require("http");
const { URL } = require("url");
const crypto = require("crypto");

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const REDIRECT_URI =
    process.env.SPOTIFY_REDIRECT_URI ||
    "https://station-255y.onrender.com/callback";

// =====================================================
// TOKEN
// =====================================================

let accessToken = null;
let refreshToken = null;
let tokenExpiration = 0;

// =====================================================
// ESTADO DO LOGIN
// =====================================================

let loginState = null;

// =====================================================
// JSON
// =====================================================

function enviarJSON(resposta, codigo, dados) {

    resposta.writeHead(codigo, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
    });

    resposta.end(JSON.stringify(dados));
}

// =====================================================
// PEGAR TOKEN
// =====================================================

async function obterToken() {

    if (
        accessToken &&
        Date.now() < tokenExpiration
    ) {
        return accessToken;
    }

    if (!refreshToken) {
        throw new Error("Spotify ainda não foi autorizado.");
    }

    const credenciais =
        Buffer
            .from(
                CLIENT_ID + ":" + CLIENT_SECRET
            )
            .toString("base64");

    const resposta = await fetch(
        "https://accounts.spotify.com/api/token",
        {
            method: "POST",

            headers: {
                "Authorization":
                    "Basic " + credenciais,

                "Content-Type":
                    "application/x-www-form-urlencoded"
            },

            body:
                new URLSearchParams({
                    grant_type:
                        "refresh_token",

                    refresh_token:
                        refreshToken
                })
        }
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
        throw new Error(
            "Erro ao renovar token: " +
            JSON.stringify(dados)
        );
    }

    accessToken =
        dados.access_token;

    tokenExpiration =
        Date.now() +
        ((dados.expires_in - 60) * 1000);

    if (dados.refresh_token) {
        refreshToken =
            dados.refresh_token;
    }

    return accessToken;
}

// =====================================================
// LOGIN SPOTIFY
// =====================================================

function iniciarLogin(resposta) {

    if (!CLIENT_ID || !CLIENT_SECRET) {

        resposta.writeHead(500, {
            "Content-Type":
                "text/plain; charset=utf-8"
        });

        resposta.end(
            "SPOTIFY_CLIENT_ID ou SPOTIFY_CLIENT_SECRET não configurado no Render."
        );

        return;
    }

    loginState =
        crypto
            .randomBytes(16)
            .toString("hex");

    const parametros =
        new URLSearchParams({

            response_type:
                "code",

            client_id:
                CLIENT_ID,

            scope:
                "user-read-currently-playing user-read-playback-state",

            redirect_uri:
                REDIRECT_URI,

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
// CALLBACK
// =====================================================

async function callbackSpotify(
    requisicao,
    resposta,
    url
) {

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
            "<h1>Login cancelado</h1><p>" +
            erro +
            "</p>"
        );

        return;
    }

    const state =
        url.searchParams.get("state");

    const code =
        url.searchParams.get("code");

    if (!state || state !== loginState) {

        resposta.writeHead(
            400,
            {
                "Content-Type":
                    "text/plain; charset=utf-8"
            }
        );

        resposta.end(
            "Estado de segurança inválido."
        );

        return;
    }

    if (!code) {

        resposta.writeHead(
            400,
            {
                "Content-Type":
                    "text/plain; charset=utf-8"
            }
        );

        resposta.end(
            "Código do Spotify não recebido."
        );

        return;
    }

    const credenciais =
        Buffer
            .from(
                CLIENT_ID + ":" + CLIENT_SECRET
            )
            .toString("base64");

    const respostaToken =
        await fetch(
            "https://accounts.spotify.com/api/token",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        "Basic " + credenciais,

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

                    })
            }
        );

    const dados =
        await respostaToken.json();

    if (!respostaToken.ok) {

        resposta.writeHead(
            500,
            {
                "Content-Type":
                    "application/json; charset=utf-8"
            }
        );

        resposta.end(
            JSON.stringify(dados)
        );

        return;
    }

    accessToken =
        dados.access_token;

    refreshToken =
        dados.refresh_token;

    tokenExpiration =
        Date.now() +
        ((dados.expires_in - 60) * 1000);

    resposta.writeHead(
        200,
        {
            "Content-Type":
                "text/html; charset=utf-8"
        }
    );

    resposta.end(`
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Music Station</title>
        </head>

        <body style="
            font-family:Arial;
            text-align:center;
            padding:40px;
        ">

            <h1>Spotify conectado!</h1>

            <p>
                Agora sua Music Station pode
                consultar a música que está tocando.
            </p>

            <p>
                Você pode fechar esta página.
            </p>

        </body>
        </html>
    `);
}

// =====================================================
// NOW PLAYING
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
                        "Bearer " + token
                }
            }
        );

    if (resposta.status === 204) {
        return {
            conectado: true,
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
            conectado: true,
            tocando: false
        };
    }

    const musica =
        dados.item;

    let capa = "";

    if (
        musica.album &&
        musica.album.images &&
        musica.album.images.length > 0
    ) {
        capa =
            musica.album.images[0].url;
    }

    let artistas = "";

    if (
        musica.artists &&
        musica.artists.length > 0
    ) {

        artistas =
            musica.artists
                .map(
                    artista => artista.name
                )
                .join(", ");
    }

    return {

        conectado: true,

        tocando:
            dados.is_playing === true,

        titulo:
            musica.name || "",

        artista:
            artistas,

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
                // TESTE PRINCIPAL
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

                            servidor:
                                "Render",

                            login:
                                "/login",

                            nowplaying:
                                "/nowplaying",

                            music:
                                "/music"
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
                        requisicao,
                        resposta,
                        url
                    );

                    return;
                }

                // =====================================
                // MÚSICA ATUAL
                // =====================================

                if (
                    url.pathname === "/nowplaying"
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
                // ROTA /MUSIC
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

                    const token =
                        await obterToken();

                    const consulta =
                        titulo +
                        " " +
                        artista;

                    const spotifyURL =
                        "https://api.spotify.com/v1/search" +
                        "?q=" +
                        encodeURIComponent(
                            consulta
                        ) +
                        "&type=track" +
                        "&limit=1" +
                        "&market=BR";

                    const busca =
                        await fetch(
                            spotifyURL,
                            {
                                headers: {
                                    "Authorization":
                                        "Bearer " +
                                        token
                                }
                            }
                        );

                    const dados =
                        await busca.json();

                    if (
                        !dados.tracks ||
                        !dados.tracks.items ||
                        dados.tracks.items.length === 0
                    ) {

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

                    const musica =
                        dados.tracks.items[0];

                    let capa = "";

                    if (
                        musica.album &&
                        musica.album.images &&
                        musica.album.images.length
                    ) {

                        capa =
                            musica.album.images[0].url;
                    }

                    enviarJSON(
                        resposta,
                        200,
                        {

                            titulo:
                                musica.name,

                            artista:
                                musica.artists
                                    .map(
                                        a => a.name
                                    )
                                    .join(", "),

                            album:
                                musica.album.name,

                            duracao:
                                musica.duration_ms,

                            capa:
                                capa,

                            spotify:
                                musica.external_urls.spotify
                        }
                    );

                    return;
                }

                // =====================================
                // NÃO ENCONTRADO
                // =====================================

                enviarJSON(
                    resposta,
                    404,
                    {
                        erro:
                            "Rota não encontrada.",
                        rota:
                            url.pathname
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
            "Redirect:",
            REDIRECT_URI
        );

        console.log(
            "Servidor iniciado."
        );
    }
);
