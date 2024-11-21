import pkg from 'pdf-lib';
const { PDFDocument } = pkg;
import fs from 'fs/promises';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { DocumentManager } from './embeddings.js';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const documentManager = new DocumentManager("documents");
await documentManager.initialize();

export class PDFProcessor {
  constructor() {
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ["\n\n", "\n", ". ", " ", ""],
    });
  }

  async processPDF(filePath) {
    try {
      // Read the PDF file
      const pdfBytes = await fs.readFile(filePath);
      
      // Parse PDF text using pdf-parse
      const pdfData = await pdfParse(pdfBytes);
      
      // Load the PDF document for metadata
      const pdfDoc = await PDFDocument.load(pdfBytes, { 
        ignoreEncryption: true,
        updateMetadata: false
      });
      
      // Get document metadata
      const title = pdfDoc.getTitle() || 'Untitled';
      const author = pdfDoc.getAuthor() || 'Unknown';
      const pageCount = pdfDoc.getPageCount();
      
      // Split text into chunks
      const chunks = await this.splitter.createDocuments([pdfData.text]);
      
      // Add metadata to each chunk
      const processedChunks = chunks.map((chunk, index) => ({
        content: chunk.pageContent,
        metadata: {
          chunk_index: index,
          total_pages: pageCount,
          pdf_title: title,
          pdf_author: author,
          chunk_start: chunk.metadata?.loc?.lines?.from || 0,
          chunk_end: chunk.metadata?.loc?.lines?.to || 0,
          source_file: filePath.split('/').pop(),
        }
      }));
      
      console.log('Processed chunks:', processedChunks);

      return {
        chunks: processedChunks,
        metadata: {
          total_pages: pageCount,
          title,
          author,
          num_chunks: processedChunks.length,
        }
      };
    } catch (error) {
      console.error('Error processing PDF:', error);
      throw new Error(`Failed to process PDF file: ${error.message}`);
    }
  }

  formatCitation(chunk) {
    return {
      content: chunk.content,
      citation: {
        title: chunk.metadata.pdf_title,
        author: chunk.metadata.pdf_author,
        page: chunk.metadata.page_number,
        source_file: chunk.metadata.source_file,
      }
    };
  }
}
