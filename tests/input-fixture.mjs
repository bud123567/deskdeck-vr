import http from "node:http";
let text = "";
http
  .createServer(async (req, res) => {
    if (req.url === "/result" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ text, verifiedAt: new Date().toISOString() }));
      return;
    }
    if (req.url === "/result" && req.method === "POST") {
      if (req.headers.origin !== "http://localhost:3446") {
        res.writeHead(403);
        res.end();
        return;
      }
      let b = "";
      for await (const c of req) {
        b += c;
        if (b.length > 4096) {
          res.writeHead(413);
          res.end();
          return;
        }
      }
      text = JSON.parse(b).text;
      res.end("ok");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      "<!doctype html><html lang=\"en\"><title>DeskDeck input check</title><style>body{background:#11151c;color:#eee;font:20px system-ui;padding:60px}textarea{display:block;width:70%;height:180px;margin-top:30px;font:24px system-ui;padding:24px}p{color:#bbc}</style><h1>DeskDeck input check</h1><p>Disposable test surface. No text is saved outside the local verification report.</p><label for=\"input\">Remote input</label><textarea id=\"input\" autofocus oninput=\"fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:this.value})})\"></textarea></html>",
    );
  })
  .listen(3446, "127.0.0.1", () =>
    console.log("Input fixture ready at http://localhost:3446"),
  );
