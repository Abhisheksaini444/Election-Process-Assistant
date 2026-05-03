import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function listModels() {
  // There isn't a direct listModels in the high level genAI object easily exposed this way
  // but we can try to hit the endpoint or check docs.
  console.log("Listing models is usually done via the REST API or specific client methods.");
}

listModels();
