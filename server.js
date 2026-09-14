const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const BASE_URL = "https://station-255y.onrender.com";

let accessToken = null;
let refreshToken = null;
let tokenExpiration = 0;

function enviarJSON(res, codigo, dados) {
    res.writeHead(codigo, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
    });

    res.end(JSON.stringify(dados));
}

function spotifyRequest(url, options = {}) {
    return new Promise((resolve, reject) => {

        const req = https.request(url, {
            method: options.method || "GET",
            headers: options.headers || {}
        }, res => {

            let data = "";

            res.on("data", chunk => data += chunk);

            res.on("end", () => {

                let json;

                try {
                    json = JSON.parse(data);
                } catch {
                    json = {};
                }

                resolve({
                    status: res.statusCode,
                    data: json
                });
            });
        });

        req.on("error", reject);

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

// =====================================================
// LOGIN SPOTIFY
// =====================================================

function paginaLogin(res) {

    const url =
        "https://accounts.spotify.com/authorize" +
        "?client_id=" + encodeURIComponent(CLIENT_ID) +
        "&response_type=code" +
        "&redirect_uri=" + encodeURIComponent(BASE_URL + "/callback") +
        "&scope=" + encodeURIComponent(
            "user-read-currently-playing user-read-playback-state"
        );

    res.writeHead(302, {
        Location: url
    });

    res.end();
}

// =====================================================
// PEGAR TOKEN
// =====================================================

async function pegarToken(code) {

    const credenciais =
        Buffer.from(
            CLIENT_ID + ":" + CLIENT_SECRET
        ).toString("base64");

    const body =
        "grant_type=authorization_code" +
        "&code=" + encodeURIComponent(code) +
        "&redirect_uri=" +
        encodeURIComponent(BASE_URL + "/callback");

    const resposta =
        await spotifyRequest(
            "https://accounts.spotify.com/api/token",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        "Basic " + credenciais,

                    "Content-Type":
                        "application/x-www-form-urlencoded",

                    "Content-Length":
                        Buffer.byteLength(body)
                },

                body: body
            }
        );

    if (resposta.status !== 200) {
        throw new Error(
            JSON.stringify(resposta.data)
        );
    }

    accessToken =
        resposta.data.access_token;

    refreshToken =
        resposta.data.refresh_token;

    tokenExpiration =
        Date.now() +
        ((resposta.data.expires_in - 60) * 1000);
}

// =====================================================
// ATUALIZAR TOKEN
// =====================================================

async function atualizarToken() {

    if (!refreshToken) {
        return false;
    }

    const credenciais =
        Buffer.from(
            CLIENT_ID + ":" + CLIENT_SECRET
        ).toString("base64");

    const body =
        "grant_type=refresh_token" +
        "&refresh_token=" +
        encodeURIComponent(refreshToken);

    const resposta =
        await spotifyRequest(
            "https://accounts.spotify.com/api/token",
            {
                method: "POST",

                headers: {
                    "Authorization":
                        "Basic " + credenciais,

                    "Content-Type":
                        "application/x-www-form-urlencoded",

                    "Content-Length":
                        Buffer.byteLength(body)
                },

                body: body
            }
        );

    if (resposta.status !== 200) {
        return false;
    }

    accessToken =
        resposta.data.access_token;

    tokenExpiration =
        Date.now() +
        ((resposta.data.expires_in - 60) * 1000);

    return true;
}

// =====================================================
// MÚSICA ATUAL
// =====================================================

async function musicaAtual() {

    if (!accessToken) {
        return {
            conectado: false,
            tocando: false
        };
    }

    if (Date.now() >= tokenExpiration) {
        await atualizarToken();
    }

    const resposta =
        await spotifyRequest(
            "https://api.spotify.com/v1/me/player",
            {
                headers: {
                    "Authorization":
                        "Bearer " + accessToken
                }
            }
        );

    if (resposta.status === 204) {
        return {
            conectado: true,
            tocando: false
        };
    }

    if (resposta.status === 401) {

        const atualizado =
            await atualizarToken();

        if (!atualizado) {
            return {
                conectado: false,
                tocando: false
            };
        }

        return musicaAtual();
    }

    if (resposta.status !== 200) {
        return {
            conectado: true,
            tocando: false
        };
    }

    const player =
        resposta.data;

    if (
        !player ||
        !player.item
    ) {
        return {
            conectado: true,
            tocando: false
        };
    }

    const musica =
        player.item;

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

        conectado: true,

        tocando:
            player.is_playing === true,

        titulo:
            musica.name || "",

        artista:
            musica.artists
                ? musica.artists
                    .map(a => a.name)
                    .join(", ")
                : "",

        album:
            musica.album
                ? musica.album.name
                : "",

        duracao:
            musica.duration_ms || 0,

        capa:
            capa,

        progresso:
            player.progress_ms || 0,

        spotify:
            musica.external_urls
                ? musica.external_urls.spotify || ""
                : ""
    };
}

// =====================================================
// SERVIDOR
// =====================================================

const servidor =
    http.createServer(
        async (req, res) => {

            try {

                const url =
                    new URL(
                        req.url,
                        "http://" +
                        req.headers.host
                    );

                // HOME
                if (url.pathname === "/") {

                    enviarJSON(res, 200, {
                        status:
                            "Music Station Spotify Server",

                        funcionando:
                            true,

                        spotify_conectado:
                            !!accessToken
                    });

                    return;
                }

                // LOGIN
                if (url.pathname === "/login") {

                    paginaLogin(res);

                    return;
                }

                // CALLBACK
                if (url.pathname === "/callback") {

                    const code =
                        url.searchParams.get("code");

                    if (!code) {

                        enviarJSON(res, 400, {
                            erro:
                                "Código Spotify não recebido."
                        });

                        return;
                    }

                    await pegarToken(code);

                    enviarJSON(res, 200, {

                        sucesso: true,

                        mensagem:
                            "Spotify conectado! Agora o ESP32 poderá receber a música atual."

                    });

                    return;
                }

                // MÚSICA ATUAL
                if (url.pathname === "/nowplaying") {

                    const resultado =
                        await musicaAtual();

                    enviarJSON(
                        res,
                        200,
                        resultado
                    );

                    return;
                }

                enviarJSON(res, 404, {
                    erro:
                        "Rota não encontrada."
                });

            } catch (erro) {

                console.error(erro);

                enviarJSON(res, 500, {
                    erro:
                        "Erro interno",

                    detalhe:
                        erro.message
                });
            }
        }
    );

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
    }
);
