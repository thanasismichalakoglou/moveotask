const https = require("https");
const express = require("express");

const app = express();
app.use(express.json()); // σημαντικό για POST body

const PORT = process.env.PORT || 3000;

const JOKE_LANGS = new Set(["cs", "de", "en", "es", "fr", "pt"]);

function normalizeLang(input) {
  const s = (input || "").toString().trim().toLowerCase();
  const base = s.split("-")[0].split("_")[0]; // de-DE -> de
  return JOKE_LANGS.has(base) ? base : "en";
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (MoveoWebhook; Railway)",
          "Accept": "application/json",
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error("Invalid JSON from JokeAPI"));
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error("Timeout")));
  });
}

async function handleJoke(req, res) {
  try {
    // προσπαθούμε να πάρουμε τη γλώσσα από διάφορα πιθανά fields του Moveo
    const langRaw =
      req.query?.lang ??
      req.body?.lang ??
      req.body?.context?.lang ??
      req.body?.context?.language ??
      req.body?.context?.user?.language ??
      req.body?.context?.user?.lang ??
      req.body?.context?.$user?.language;

    const lang = normalizeLang(langRaw);

    const jokeApiUrl =
      `https://v2.jokeapi.dev/joke/Any` +
      `?type=single` +
      `&safe-mode` +
      `&blacklistFlags=nsfw,religious,political,racist,sexist,explicit` +
      `&lang=${encodeURIComponent(lang)}`;

    const joke = await getJson(jokeApiUrl);

    // graceful handling αν το API γυρίσει error
    if (joke?.error) {
      return res.json({
        context: { lang_used: "en", lang_raw: String(langRaw || "") },
        responses: [
          {
            type: "text",
            texts: ["Sorry — I couldn't fetch a joke in that language right now. Here's one in English:"],
          },
        ],
      });
    }

    const jokeText = joke?.joke || "No joke found — try again!";

    return res.json({
      context: { lang_used: lang, lang_raw: String(langRaw || "") },
      responses: [{ type: "text", texts: [jokeText] }],
    });
  } catch (e) {
    return res.json({
      responses: [{ type: "text", texts: ["Sorry — couldn't fetch a joke. Try again."] }],
      context: { error: String(e?.message || e) },
    });
  }
}

// Moveo κάνει POST
app.post("/webhook/joke", handleJoke);

// browser test (προαιρετικό αλλά χρήσιμο)
app.get("/webhook/joke", handleJoke);

app.get("/", (req, res) => res.send("OK"));

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
