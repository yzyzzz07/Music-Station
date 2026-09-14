const http = require("http");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {

    console.log("REQUISIÇÃO:", req.url);

    if (req.url === "/") {
        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("MUSIC STATION FUNCIONANDO");
        return;
    }

    if (req.url === "/login") {
        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8"
        });

        res.end("LOGIN FUNCIONANDO");
        return;
    }

    res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end("ROTA NAO ENCONTRADA");
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("Servidor iniciado na porta " + PORT);
});
