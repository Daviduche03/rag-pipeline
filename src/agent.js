import { createAzure } from "@ai-sdk/azure";
import dotenv from "dotenv";
import { DocumentManager } from "./embeddings.js";
import { z } from "zod";
import { generateText, tool } from "ai";

dotenv.config();

const documentManager = new DocumentManager("documents");

await documentManager.initialize();

const tools = {
  searchKnowledgeBase: tool({
    description: `Search and retrieve information from the knowledge base with accurate citations.`,
    parameters: z.object({
      content: z
        .string()
        .describe(
          "what you want to search on the knowledge base, be specific, and direct to the content you are looking for"
        ),
    }),
    execute: async ({ content }) => {
      console.log(content);
      const results = await documentManager.query({
        queryText: content,
        nResults: 5,
      });
      console.log(results, "results", content);
      const formattedResults = results.points.map((result) => ({
        content: result.payload.content,
        score: result.score,
        citation: `[source](${result.payload.source_file})`,
        metadata: {
          title: result.payload.pdf_title || "Untitled",
          author: result.payload.pdf_author || "Unknown",
          page: result.payload.page_number,
        }
      }));
      console.log("Formatted results:", formattedResults);
      return formattedResults;
    },
  }),
};

class Agent {
  constructor(config = {}) {
    this.config = config;
    this.azure = null;
    this.resourceName = process.env.AZURE_OPENAI_API_INSTANCE_NAME || "";
  }

  async getAzure() {
    if (!this.azure) {
      this.azure = createAzure({
        resourceName: this.resourceName,
      });
    }
    return this.azure;
  }

  async processMessage(messages) {
    const azure = await this.getAzure();
    const result = await generateText({
      model: azure(process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME || ""),
      system: `You are a helpful assistant specializing in financial document analysis. Follow these rules strictly:

1. Always provide accurate information from the knowledge base
2. Include markdown citations for every piece of information using format: [source](file_path)
3. If multiple sources support a statement, include all relevant citations
4. If you don't find relevant information, say so instead of making up answers
5. Format responses clearly and concisely
6. Ensure citations are properly linked to specific claims
7. Verify information across multiple sources when available

Your responses should be well-structured, accurate, and properly cited.`,
      messages: messages,
      tools,
      maxSteps: 5,
    });
    return result.text;
  }
}

export default Agent;
