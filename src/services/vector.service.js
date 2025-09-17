require("dotenv").config();
const { Pinecone } = require('@pinecone-database/pinecone');

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const GPT_ProjectIndex = pc.Index("gpt-project");

const createMemory = async ({vectors, metadata, messageId})=>{
    await GPT_ProjectIndex.upsert([{
        id: messageId,
        values: vectors,
        metadata,
    }]);
};

const queryMemory = async ({queryVector, limit = 5, metadata})=>{
    const data = await GPT_ProjectIndex.query({
        vector: queryVector,
        topK: limit,
        filter: metadata ? {metadata} : undefined,
        includeMetadata: true,
    });

    return data.matches;
};

module.exports = {
    createMemory,
    queryMemory,
};