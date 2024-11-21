import { PDFProcessor } from "./pdfProcessor.js";
import path from 'path';
import { fileURLToPath } from 'url';
import { DocumentManager } from "./embeddings.js";

const documentManager = new DocumentManager("documents");
await documentManager.initialize();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pdfProcessor = new PDFProcessor();
const filePath = path.resolve(__dirname, "../src/evaluation/dataset/pdfs/NVIDIAAn.pdf");
const result = await pdfProcessor.processPDF(filePath);

// Format chunks into documents with content and metadata
const documents = result.chunks.map(chunk => ({
  document: chunk.content,
  metadata: {
    title: chunk.metadata.pdf_title,
    author: chunk.metadata.pdf_author,
    page: chunk.metadata.page_number,
    source_file: chunk.metadata.source_file,
    total_pages: chunk.metadata.total_pages,
    chunk_index: chunk.metadata.chunk_index
  }
}));

console.log(`Processing ${documents.length} chunks from PDF...`);
await documentManager.add(documents, () => {
  console.log("Chunk processed successfully");
});
