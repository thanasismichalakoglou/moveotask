const https = require("https");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (MoveoWebhook; Render)",
          "Accept": "application/json",
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error("Invalid JSON from JokeAPI")); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(8000, () => req.destroy(new Error("Timeout")));
  });
}

app.get("/webhook/joke", async (req, res) => {
  try {
    const jokeApiUrl =
      "https://v2.jokeapi.dev/joke/Any?type=single&safe-mode&blacklistFlags=nsfw,religious,political,racist,sexist,explicit";

    const joke = await getJson(jokeApiUrl);
    const jokeText = joke?.joke || "No joke found — try again!";

    return res.json({
      responses: [{ type: "text", texts: [jokeText] }],
    });
  } catch (e) {
    return res.json({
      responses: [{ type: "text", texts: ["Sorry — couldn't fetch a joke. Try again."] }],
    });
  }
});

app.get("/", (req, res) => res.send("OK"));

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
