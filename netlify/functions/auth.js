import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const LANGUAGE_VOICE_MAP = {
  'English': 'onyx',   // 'onyx' (male), 'nova' (female), or 'echo' (child) sound most natural for English
  'Turkce' : 'alloy',  // Not ideal; OpenAI only supports 'alloy' for Turkish
  'Dansk': 'nova'     // Danish handled via English accent; OpenAI not yet optimized for Dansk
};

const MAX_TTS_CHARS = 3400;

export async function handler(event, context) {
  try {
    const { text, language } = JSON.parse(event.body);

    if (!text || !text.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing text" }),
      };
    }

    // only send part that fits in one call
    const part = text.slice(0, MAX_TTS_CHARS);

    // Pick a voice
    const voice = LANGUAGE_VOICE_MAP[language] || 'onyx';

    //tts-1 = quality expensive
    //gpt-4o-mini-tts = fast and cheap
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts", // or "tts-1-hd" (HD = slower, better for long stories)
      voice,
      input: text,
      response_format: "mp3",
      speed: 0.9  // Optionally set to 0.9 for slower for kids
    });

    // response is a stream!
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": "inline;filename=story.mp3"
      },
      isBase64Encoded: true,
      body: buffer.toString('base64')
    };
  } catch (err) {
    console.error("TTS function error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Unknown error" }),
    };
  }
}