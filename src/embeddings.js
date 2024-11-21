import { QdrantClient } from "@qdrant/js-client-rest";
import { embed, embedMany } from "ai";
import { azure } from "@ai-sdk/azure";
import { v4 as uuidv4 } from "uuid";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import dotenv from "dotenv";

dotenv.config();

const embeddingModel = azure.textEmbeddingModel(
  process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME || "",
);

const generateEmbeddings = async (chunks) => {
  const { embeddings } = await embedMany({
    model: embeddingModel,
    values: chunks,
  });
  return embeddings.map((e, i) => ({
    id: i,
    content: chunks[i],
    embedding: e,
  }));
};

const embedQuery = async (value) => {
  const input = value.replaceAll("\\n", " ");
  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });
  return embedding;
};

export class DocumentManager {
  constructor(collectionName) {
    this.client = new QdrantClient({
      url: process.env.QDRANT_ENDPOINT,
      apiKey: process.env.QDRANT_API_KEY,
    });
    this.collectionName = collectionName;
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ["\n\n", "\n", " ", ""],
    });
  }

  async initialize() {
    try {
      const collection = await this.client.getCollection(this.collectionName);
      console.log(`Collection ${this.collectionName} already exists`);
      return collection;
    } catch (error) {
      if (error.status === 404) {
        try {
          await this.client.createCollection(this.collectionName, {
            vectors: {
              size: 3072,
              distance: "Cosine",
            },
          });
          console.log(`Collection ${this.collectionName} created successfully.`);
          return await this.client.getCollection(this.collectionName);
        } catch (createError) {
          console.error(`Failed to create collection: ${createError.message}`);
          throw createError;
        }
      } else {
        console.error(`Unexpected error: ${error.message}`);
        throw error;
      }
    }
  }

  async add(documents, callback) {
    try {
      for (const { document, metadata } of documents) {
        console.log("Processing document:", { document, metadata });
        const chunks = await this.splitter.createDocuments([document]);
        const embeddings = await generateEmbeddings(chunks.map((doc) => doc.pageContent));

        const points = embeddings.map((embedding, index) => {
          const id = uuidv4();
          return {
            id,
            vector: embedding.embedding,
            payload: {
              content: embedding.content,
              chunk_index: index,
              ...metadata, // Include all PDF metadata
            },
          };
        });

        await this.client.upsert(this.collectionName, {
          wait: true,
          points,
        });

        if (callback) callback();
      }
    } catch (error) {
      console.error("Error adding documents:", error);
      throw error;
    }
  }

  async query({ queryText, nResults = 10, where }) {
    console.log(queryText);
    const embeddedQuery = await embedQuery(queryText);
    const filter = where
      ? {
          must: Object.entries(where).map(([key, value]) => ({
            key,
            match: { value },
          })),
        }
      : undefined;

    // console.log(filter?.must[0], filter);
    const searchResult = await this.client.query(this.collectionName, {
      query: embeddedQuery,
      filter,
      limit: nResults,
      with_payload: true,
    });

    return searchResult;
  }

  async delete(points) {
    console.log(points);
    await this.client.delete(this.collectionName, {
      wait: true,
      points,
    });
  }
}