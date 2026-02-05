const https = require("https");
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const JOKE_LANGS = new Set(["cs", "de", "en", "es", "fr", "pt"]);

function normalizeLang(input) {
  const s = (input || "").toString().trim().toLowerCase();
  const base = s.split("-")[0].split("_")[0]; // de-DE -> de
  return JOKE_LANGS.has(base) ? base : null;
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

// Moveo payload (σύμφωνα με το docs σου): { input: { text: "..." }, context: {...} }
function getInputText(req) {
  return (req.body?.input?.text || "").toString().trim();
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

function languagePrompt(extraText = null) {
  return {
    context: { awaiting_lang: true },
    responses: [
      {
        type: "text",
        texts: [
          extraText ||
            "Which language do you want the joke in? (en, de, es, fr, pt, cs)"
        ],
        options: [
          { label: "English", text: "en" },
          { label: "Deutsch", text: "de" },
          { label: "Español", text: "es" },
          { label: "Français", text: "fr" },
          { label: "Português", text: "pt" },
          { label: "Čeština", text: "cs" },
        ],
      },
    ],
  };
}

async function jokeReply(lang) {
  const jokeApiUrl =
    `https://v2.jokeapi.dev/joke/Any` +
    `?type=single` +
    `&safe-mode` +
    `&blacklistFlags=nsfw,religious,political,racist,sexist,explicit` +
    `&lang=${encodeURIComponent(lang)}`;

  const joke = await getJson(jokeApiUrl);

  if (joke?.error) {
    // αν δεν βρει safe joke στη γλώσσα κλπ → fallback
    return {
      context: { awaiting_lang: false, lang_used: "en" },
      responses: [
        {
          type: "text",
          texts: [
            "Sorry — I couldn't fetch a joke in that language right now. Here's one in English:"
          ],
        },
      ],
    };
  }

  return {
    context: { awaiting_lang: false, lang_used: lang },
    responses: [{ type: "text", texts: [joke.joke || "No joke found — try again!"] }],
  };
}

app.post("/webhook/joke", async (req, res) => {
  try {
    const inputText = getInputText(req);
    const ctx = req.body?.context || {};
    const awaiting = !!ctx.awaiting_lang;

    // 1) Αν ΔΕΝ περιμένουμε γλώσσα → ρώτα γλώσσα (πάντα)
    //    (Αυτό κάνει το flow ανεξάρτητο από Question node)
    if (!awaiting) {
      return res.json(languagePrompt());
    }

    // 2) Αν περιμένουμε γλώσσα → διάβασε την απάντηση του χρήστη
    const guessed = mapToLangCode(inputText);
    const lang = normalizeLang(guessed);

    if (!lang) {
      return res.json(
        languagePrompt(
          `I didn't understand "${inputText}". Please choose one of: en, de, es, fr, pt, cs.`
        )
      );
    }

    // 3) Φέρε joke στη σωστή γλώσσα
    const reply = await jokeReply(lang);
    return res.json(reply);
  } catch (e) {
    return res.json({
      context: { awaiting_lang: false, error: String(e?.message || e) },
      responses: [{ type: "text", texts: ["Sorry — server error. Please try again."] }],
    });
  }
});

// (προαιρετικό) health check
app.get("/", (req, res) => res.send("OK"));

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
