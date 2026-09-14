const http = require("http");
const https = require("https");
const { URL } = require("url");

// =====================================================
// CONFIGURAÇÃO
// =====================================================

const PORT = process.env.PORT || 10000;

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// =====================================================
// TOKEN DO SPOTIFY
// =====================================================

let accessToken = null;
let tokenExpiration = 0;

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

    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error(
            "SPOTIFY_CLIENT_ID ou SPOTIFY_CLIENT_SECRET não configurado."
        );
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
                "grant_type=client_credentials"
        }
    );

    if (!resposta.ok) {

        const erro =
            await resposta.text();

        throw new Error(
            "Erro ao obter token Spotify: " +
            resposta.status +
            " " +
            erro
        );
    }

    const dados =
        await resposta.json();

    accessToken =
        dados.access_token;

    // Renovamos um pouco antes de expirar
    tokenExpiration =
        Date.now() +
        ((dados.expires_in - 60) * 1000);

    return accessToken;
}

// =====================================================
// BUSCAR MÚSICA
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
                        "Bearer " + token
                }
            }
        );

    if (!resposta.ok) {

        const erro =
            await resposta.text();

        throw new Error(
            "Erro na busca Spotify: " +
            resposta.status +
            " " +
            erro
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

    // =================================================
    // CAPA
    // =================================================

    let capa = "";

    if (
        musica.album &&
        musica.album.images &&
        musica.album.images.length > 0
    ) {

        /*
         * A primeira imagem normalmente é
         * a maior disponível.
         */

        capa =
            musica.album.images[0].url;
    }

    // =================================================
    // ARTISTA
    // =================================================

    let nomeArtista =
        artista;

    if (
        musica.artists &&
        musica.artists.length > 0
    ) {

        nomeArtista =
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

        titulo:
            musica.name,

        artista:
            nomeArtista,

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
// RESPOSTA JSON
// =====================================================

function enviarJSON(
    resposta,
    codigo,
    dados
) {

    const texto =
        JSON.stringify(
            dados
        );

    resposta.writeHead(
        codigo,
        {
            "Content-Type":
                "application/json; charset=utf-8",

            "Access-Control-Allow-Origin":
                "*",

            "Cache-Control":
                "no-cache"
        }
    );

    resposta.end(
        texto
    );
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
                                "Music Station Spotify Server",
                            funcionando:
                                true
                        }
                    );

                    return;
                }

                // =====================================
                // BUSCAR MÚSICA
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

                    // -------------------------------
                    // VERIFICAÇÃO
                    // -------------------------------

                    if (
                        titulo.length === 0
                    ) {

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

                    console.log(
                        "Busca:",
                        titulo,
                        "-",
                        artista
                    );

                    // -------------------------------
                    // SPOTIFY
                    // -------------------------------

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
                                    "Musica não encontrada.",
                                titulo:
                                    titulo,
                                artista:
                                    artista
                            }
                        );

                        return;
                    }

                    console.log(
                        "Encontrada:",
                        resultado.titulo
                    );

                    console.log(
                        "Capa:",
                        resultado.capa
                    );

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
                            "Erro interno do servidor.",
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
            "Servidor iniciado."
        );
    }
);
