require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Config from env (do NOT hardcode secrets)
const USERNAME = process.env.USERNAME || "";
const PASSWORD = process.env.PASSWORD || "";
const SECRET_MESSAGE = process.env.SECRET_MESSAGE || "no secret set";

app.get("/", (req, res) => {
  res.send("Hello, world!");
});

app.get("/health", (req, res) => {
  res.status(200).send("ok");
});

// Basic Auth middleware (minimal + clear)
function basicAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [type, encoded] = header.split(" ");

  if (type !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", 'Basic realm="Restricted"');
    return res.status(401).send("Auth required");
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const sepIndex = decoded.indexOf(":");
  if (sepIndex === -1) return res.status(401).send("Invalid auth format");

  const user = decoded.slice(0, sepIndex);
  const pass = decoded.slice(sepIndex + 1);

  const ok = user === USERNAME && pass === PASSWORD;
  if (!ok) return res.status(403).send("Forbidden");

  next();
}

app.get("/secret", basicAuth, (req, res) => {
  res.send(SECRET_MESSAGE);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});