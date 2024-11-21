import { PDFProcessor } from "./pdfProcessor.js";
import path from 'path';
import { fileURLToPath } from 'url';
import { DocumentManager } from "./embeddings.js";
import { promises as fs } from 'fs';

const documentManager = new DocumentManager("documents");
await documentManager.initialize();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pdfProcessor = new PDFProcessor();
const pdfDirectory = path.resolve(__dirname, "../src/evaluation/dataset/pdfs");

async function processAllPDFs() {
  try {
    // Get all files in the PDF directory
    const files = await fs.readdir(pdfDirectory);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    
    console.log(`Found ${pdfFiles.length} PDF files to process`);
    
    for (const pdfFile of pdfFiles) {
      const filePath = path.join(pdfDirectory, pdfFile);
      console.log(`Processing ${pdfFile}...`);
      
      try {
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

        console.log(`Processing ${documents.length} chunks from ${pdfFile}...`);
        await documentManager.add(documents, () => {
          console.log(`Chunk from ${pdfFile} processed successfully`);
        });
        
        console.log(`Finished processing ${pdfFile}`);
      } catch (error) {
        console.error(`Error processing ${pdfFile}:`, error);
        // Continue with next file even if current one fails
        continue;
      }
    }
    
    console.log('All PDF files have been processed');
  } catch (error) {
    console.error('Error reading PDF directory:', error);
  }
}

// Run the processing
await processAllPDFs();
