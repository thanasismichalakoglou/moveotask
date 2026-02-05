const https = require("https");
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const JOKE_LANGS = new Set(["cs", "de", "en", "es", "fr", "pt"]);

function normalizeLang(input) {
  const s = (input || "").toString().trim().toLowerCase();
  const base = s.split("-")[0].split("_")[0]; // de-DE -> de
  return JOKE_LANGS.has(base) ? base : "en";
}

function mapToLangCode(s) {
  const t = (s || "").toString().trim().toLowerCase();
  if (["de", "german", "deutsch"].includes(t)) return "de";
  if (["en", "english", "anglais"].includes(t)) return "en";
  if (["es", "spanish", "español", "espanol"].includes(t)) return "es";
  if (["fr", "french", "français", "francais"].includes(t)) return "fr";
  if (["pt", "portuguese", "português", "portugues"].includes(t)) return "pt";
  if (["cs", "czech", "čeština", "cestina"].includes(t)) return "cs";
  return t;
}

// ✅ Moveo test payload uses: { input: { text: "Hi" }, context: {...} }
function extractUserText(req) {
  const b = req.body || {};
  const v =
    b.input?.text ?? // ✅ το βασικό για Moveo
    b.text ??
    b.message ??
    b.query ??
    b.user_message ??
    b.userMessage ??
    b.payload?.text ??
    b.payload?.message ??
    b.request?.text ??
    b.request?.message ??
    b.event?.text ??
    b.event?.message ??
    b.context?.text ??
    b.context?.message ??
    "";
  return (v || "").toString();
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
    // 1) αν έχεις περάσει lang κάπως στο context/fields, το πιάνουμε
    // 2) αλλιώς παίρνουμε τη γλώσσα από το τελευταίο user input (Question answer)
    const userText = extractUserText(req);

    const langRaw =
      req.query?.lang ??
      req.body?.lang ??
      req.body?.context?.lang ??
      req.body?.context?.language ??
      req.body?.context?.user?.language ??
      userText;

    const lang = normalizeLang(mapToLangCode(langRaw));

    const jokeApiUrl =
      `https://v2.jokeapi.dev/joke/Any` +
      `?type=single` +
      `&safe-mode` +
      `&blacklistFlags=nsfw,religious,political,racist,sexist,explicit` +
      `&lang=${encodeURIComponent(lang)}`;

    const joke = await getJson(jokeApiUrl);

    if (joke?.error) {
      // graceful fallback
      return res.json({
        context: {
          lang_used: "en",
          lang_raw: String(langRaw || ""),
          user_text: userText.slice(0, 80),
        },
        responses: [
          {
            type: "text",
            texts: [
              "Sorry — I couldn't fetch a joke in that language right now. Here's one in English:",
            ],
          },
        ],
      });
    }

    const jokeText = joke?.joke || "No joke found — try again!";

    return res.json({
      context: {
        lang_used: lang,
        lang_raw: String(langRaw || ""),
        user_text: userText.slice(0, 80),
      },
      responses: [{ type: "text", texts: [jokeText] }],
    });
  } catch (e) {
    return res.json({
      context: { error: String(e?.message || e) },
      responses: [{ type: "text", texts: ["Sorry — couldn't fetch a joke. Try again."] }],
    });
  }
}

// Moveo κάνει POST
app.post("/webhook/joke", handleJoke);

// Προαιρετικό browser test
app.get("/webhook/joke", handleJoke);

app.get("/", (req, res) => res.send("OK"));

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
