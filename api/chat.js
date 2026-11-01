import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_TURNS = 20;

const FRIENDLY_ERROR =
  "Sorry, something went wrong on my side. Please try again in a moment.";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const incoming = Array.isArray(body?.messages) ? body.messages : [];

    if (incoming.length === 0) {
      return Response.json(
        { error: "Please send a question first." },
        { status: 400 }
      );
    }

    const tooLong = incoming.some(
      (message) =>
        typeof message?.content !== "string" ||
        message.content.length > MAX_MESSAGE_LENGTH
    );

    if (tooLong) {
      return Response.json(
        {
          error:
            "That message is a little long. Please keep it under 2000 characters.",
        },
        { status: 400 }
      );
    }

    const messages = incoming
      .filter(
        (message) => message.role === "user" || message.role === "assistant"
      )
      .map((message) => ({ role: message.role, content: message.content }))
      .slice(-MAX_TURNS);

    // Claude expects the conversation to start with the visitor.
    if (messages[0]?.role === "assistant") {
      messages.shift();
    }

    if (messages.length === 0) {
      return Response.json(
        { error: "Please send a question first." },
        { status: 400 }
      );
    }

    const systemPrompt = readFileSync(
      new URL("./system-prompt.txt", import.meta.url),
      "utf8"
    );

    const anthropic = new Anthropic();

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: systemPrompt,
      messages: messages,
    });

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    if (!reply.trim()) {
      return Response.json({ error: FRIENDLY_ERROR }, { status: 502 });
    }

    return Response.json({ reply });
  } catch (error) {
    console.error("Chat request failed:", error);
    return Response.json({ error: FRIENDLY_ERROR }, { status: 500 });
  }
}
