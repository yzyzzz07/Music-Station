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
    "https://music-station-255y.onrender.com/callback";

// Permissão para saber qual música está tocando
const SCOPE =
    "user-read-currently-playing user-read-playback-state";

// =====================================================
// TOKEN
// =====================================================

let accessToken = null;
let refreshToken = null;
let tokenExpiration = 0;

// =====================================================
// ESTADO DO LOGIN
// =====================================================

let estadoLogin = null;

// =====================================================
// FUNÇÃO PARA ENVIAR JSON
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
// PEGAR TOKEN PELO REFRESH TOKEN
// =====================================================

async function atualizarToken() {

    if (!refreshToken) {
        throw new Error("Spotify ainda não foi conectado.");
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
                    grant_type: "refresh_token",
                    refresh_token: refreshToken
                })
        }
    );

    if (!resposta.ok) {

        const erro = await resposta.text();

        throw new Error(
            "Erro ao atualizar token: " +
            resposta.status +
            " " +
            erro
        );
    }

    const dados = await resposta.json();

    accessToken =
        dados.access_token;

    tokenExpiration =
        Date.now() +
        ((dados.expires_in - 60) * 1000);

    // Alguns refresh tokens podem ser renovados
    if (dados.refresh_token) {
        refreshToken =
            dados.refresh_token;
    }

    return accessToken;
}

// =====================================================
// PEGAR TOKEN VÁLIDO
// =====================================================

async function obterToken() {

    if (
        accessToken &&
        Date.now() < tokenExpiration
    ) {
        return accessToken;
    }

    return await atualizarToken();
}

// =====================================================
// LOGIN SPOTIFY
// =====================================================

function iniciarLogin(resposta) {

    if (!CLIENT_ID || !CLIENT_SECRET) {

        enviarJSON(
            resposta,
            500,
            {
                erro:
                    "SPOTIFY_CLIENT_ID ou SPOTIFY_CLIENT_SECRET não configurado no Render."
            }
        );

        return;
    }

    estadoLogin =
        crypto.randomBytes(32).toString("hex");

    const parametros =
        new URLSearchParams({

            client_id:
                CLIENT_ID,

            response_type:
                "code",

            redirect_uri:
                REDIRECT_URI,

            scope:
                SCOPE,

            state:
                estadoLogin
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
// CALLBACK DO SPOTIFY
// =====================================================

async function callbackSpotify(
    requisicao,
    resposta,
    url
) {

    const code =
        url.searchParams.get("code");

    const state =
        url.searchParams.get("state");

    const erro =
        url.searchParams.get("error");

    if (erro) {

        enviarJSON(
            resposta,
            400,
            {
                erro:
                    "Login Spotify cancelado.",
                detalhe:
                    erro
            }
        );

        return;
    }

    if (
        !code ||
        !state ||
        state !== estadoLogin
    ) {

        enviarJSON(
            resposta,
            400,
            {
                erro:
                    "Código ou estado de login inválido."
            }
        );

        return;
    }

    estadoLogin = null;

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

    if (!respostaToken.ok) {

        const erroToken =
            await respostaToken.text();

        throw new Error(
            "Erro no login Spotify: " +
            respostaToken.status +
            " " +
            erroToken
        );
    }

    const dados =
        await respostaToken.json();

    accessToken =
        dados.access_token;

    refreshToken =
        dados.refresh_token;

    tokenExpiration =
        Date.now() +
        ((dados.expires_in - 60) * 1000);

    // Página simples de sucesso
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
<meta name="viewport"
      content="width=device-width,initial-scale=1">
<title>Music Station</title>
<style>
body {
    font-family: Arial;
    text-align: center;
    padding: 40px;
    background: white;
    color: black;
}
h1 {
    font-size: 28px;
}
p {
    font-size: 18px;
}
</style>
</head>

<body>

<h1>✓ Spotify conectado!</h1>

<p>
O Music Station agora pode consultar
a música que está tocando.
</p>

<p>
Você já pode testar:
</p>

<p>
<b>/nowplaying</b>
</p>

</body>
</html>
`);

}

// =====================================================
// MÚSICA ATUAL
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

    // Nenhuma música tocando
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

    // =================================================
    // ARTISTA
    // =================================================

    let artista = "";

    if (
        musica.artists &&
        musica.artists.length
    ) {

        artista =
            musica.artists
                .map(
                    a => a.name
                )
                .join(", ");
    }

    // =================================================
    // CAPA
    // =================================================

    let capa = "";

    if (
        musica.album &&
        musica.album.images &&
        musica.album.images.length
    ) {

        // Primeira imagem = maior disponível
        capa =
            musica.album.images[0].url;
    }

    // =================================================
    // DURAÇÃO
    // =================================================

    const duracao =
        musica.duration_ms || 0;

    // =================================================
    // POSIÇÃO
    // =================================================

    const posicao =
        dados.progress_ms || 0;

    // =================================================
    // RETORNO
    // =================================================

    return {

        conectado:
            true,

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
            duracao,

        posicao:
            posicao,

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
                // PÁGINA PRINCIPAL
                // =====================================

                if (
                    url.pathname === "/"
                ) {

                    enviarJSON(
                        resposta,
                        200,
                        {
                            status:
                                "Music Station funcionando!",
                            login:
                                "/login",
                            nowplaying:
                                "/nowplaying"
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
                // NOW PLAYING
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
            "================================"
        );

        console.log(
            "Porta:",
            PORT
        );

        console.log(
            "Servidor iniciado."
        );

    }
);
