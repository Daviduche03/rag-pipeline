import Agent from '../agent.js';
import { DocumentManager } from '../embeddings.js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { embed } from 'ai';
import { azure } from '@ai-sdk/azure';

dotenv.config();

const embeddingModel = azure.textEmbeddingModel(
    process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME || "text-embedding-3-large",
);

class EvaluationFramework {
    constructor() {
        this.agent = new Agent();
        this.documentManager = new DocumentManager("documents");
        this.results = {
            overall: {
                success_rate: 0,
                accuracy: 0,
                relevance: 0,
                citation_quality: 0,
                response_time: 0,
            },
            by_category: {},
            errors: [],
        };
    }

    async loadEvaluationDataset() {
        try {
            const datasetPath = path.join(process.cwd(), 'src/evaluation/dataset/eval_data.json');
            const rawData = await fs.readFile(datasetPath, 'utf8');
            return JSON.parse(rawData);
        } catch (error) {
            console.error('Error loading evaluation dataset:', error);
            throw error;
        }
    }

    async calculateAccuracy(result, expectedResult) {
        try {
            // Convert both result and expected result to embeddings
            const resultEmbedding = await embed({
                model: embeddingModel,
                value: result
            });
            
            const expectedEmbedding = await embed({
                model: embeddingModel,
                value: expectedResult.content
            });

            // Calculate cosine similarity between embeddings
            const similarity = this.cosineSimilarity(
                resultEmbedding.embedding,
                expectedEmbedding.embedding
            );

            return similarity;
        } catch (error) {
            console.error('Error calculating accuracy:', error);
            return 0;
        }
    }

    async calculateRelevance(result, query) {
        try {
            // Convert query and result to embeddings
            const queryEmbedding = await embed({
                model: embeddingModel,
                value: query
            });
            
            const resultEmbedding = await embed({
                model: embeddingModel,
                value: result
            });

            // Calculate semantic similarity
            const similarity = this.cosineSimilarity(
                queryEmbedding.embedding,
                resultEmbedding.embedding
            );

            return similarity;
        } catch (error) {
            console.error('Error calculating relevance:', error);
            return 0;
        }
    }

    extractCitations(text) {
        try {
            const citationRegex = /\[source\]\((.*?)\)/g;
            const matches = [...text.matchAll(citationRegex)];
            return matches.map(match => match[1]);
        } catch (error) {
            this.results.errors.push({
                type: 'citation_extraction_error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return [];
        }
    }

    async assessCitationQuality(result, expectedCitations) {
        try {
            const citations = this.extractCitations(result);
            if (!citations.length && !expectedCitations.sources.length) {
                return 1.0; // Perfect score for correctly having no citations
            }
            if (!citations.length && expectedCitations.sources.length > 0) {
                return 0.0; // Missing required citations
            }

            let score = 0;
            const weights = {
                presence: 0.4,  // Citation exists
                relevance: 0.6  // Citation matches expected source
            };

            // Check presence and relevance of citations
            const expectedFiles = expectedCitations.sources.map(s => s.file);
            const foundFiles = new Set(citations);

            // Calculate presence score
            const presenceScore = Math.min(citations.length, expectedFiles.length) / Math.max(citations.length, expectedFiles.length);
            
            // Calculate relevance score
            let relevanceScore = 0;
            for (const file of expectedFiles) {
                if (foundFiles.has(file)) {
                    relevanceScore += 1;
                }
            }
            relevanceScore = relevanceScore / expectedFiles.length;

            score = (weights.presence * presenceScore) + (weights.relevance * relevanceScore);
            return score;
        } catch (error) {
            this.results.errors.push({
                type: 'citation_quality_error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return 0;
        }
    }

    logError(category, error) {
        this.results.errors.push({
            category,
            type: error.name || 'unknown_error',
            message: error.message,
            timestamp: new Date().toISOString(),
            stack: error.stack
        });
    }

    async evaluateTestCase(testCase) {
        try {
            const startTime = Date.now();
            
            const response = await this.agent.processMessage([
                { role: "user", content: testCase.query }
            ]);

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            const accuracy = await this.calculateAccuracy(
                response,
                testCase.expectedResult
            );
            const relevance = await this.calculateRelevance(
                response,
                testCase.query
            );
            const citationQuality = await this.assessCitationQuality(
                response,
                testCase.expectedResult.expectedCitations
            );

            return {
                success: true,
                accuracy,
                relevance,
                citation_quality: citationQuality,
                response_time: responseTime,
                errors: []
            };
        } catch (error) {
            this.logError(testCase.category, error);
            return {
                success: false,
                accuracy: 0,
                relevance: 0,
                citation_quality: 0,
                response_time: 0,
                errors: [error.message]
            };
        }
    }

    async runEvaluation() {
        try {
            console.log('Starting evaluation...');
            const dataset = await this.loadEvaluationDataset();
            console.log(`Loaded ${dataset.testCases.length} test cases`);

            const results = {
                metrics: {
                    accuracy: [],
                    relevance: [],
                    citationQuality: [],
                    responseTime: []
                },
                successfulQueries: 0,
                totalQueries: dataset.testCases.length,
                errors: []
            };

            for (const testCase of dataset.testCases) {
                try {
                    console.log(`Processing test case: "${testCase.query}"`);
                    const evaluationResult = await this.evaluateTestCase(testCase);

                    if (evaluationResult.success) {
                        results.metrics.accuracy.push(evaluationResult.accuracy);
                        results.metrics.relevance.push(evaluationResult.relevance);
                        results.metrics.citationQuality.push(evaluationResult.citation_quality);
                        results.metrics.responseTime.push(evaluationResult.response_time);
                        results.successfulQueries++;
                        console.log('Test case processed successfully');
                    } else {
                        results.errors.push({
                            query: testCase.query,
                            error: evaluationResult.error || 'Unknown error'
                        });
                        console.error(`Failed to process test case: ${evaluationResult.error}`);
                    }
                } catch (error) {
                    results.errors.push({
                        query: testCase.query,
                        error: error.message
                    });
                    console.error(`Error processing test case: ${error.message}`);
                }
            }

            const finalResults = {
                success_rate: results.successfulQueries / results.totalQueries,
                accuracy: this.calculateAverage(results.metrics.accuracy),
                relevance: this.calculateAverage(results.metrics.relevance),
                citation_quality: this.calculateAverage(results.metrics.citationQuality),
                response_time: this.calculateAverage(results.metrics.responseTime),
                total_queries: results.totalQueries,
                successful_queries: results.successfulQueries,
                errors: results.errors
            };

            const outputPath = path.join(process.cwd(), 'evaluation-results.json');
            await fs.writeFile(
                outputPath,
                JSON.stringify(finalResults, null, 2),
                'utf8'
            );
            console.log(`Results saved to ${outputPath}`);
            return finalResults;
        } catch (error) {
            console.error('Fatal error in evaluation:', error);
            throw error;
        }
    }

    calculateAverage(array) {
        return array.reduce((a, b) => a + b, 0) / array.length;
    }

    cosineSimilarity(vecA, vecB) {
        const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
        const magnitudeA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
        const magnitudeB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
        return dotProduct / (magnitudeA * magnitudeB);
    }
}

// Run evaluation
const evaluator = new EvaluationFramework();
evaluator.runEvaluation()
    .then(results => {
        console.log('Evaluation Results:', JSON.stringify(results, null, 2));
    })
    .catch(error => {
        console.error('Evaluation failed:', error);
    });
