'use strict';
import OpenAI from "openai";
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAPI_API_KEY
})

import cassandra from '../nodejs-driver/index.js';

// This works with astra, but it's necessary to do a few things:
// * get bundle and include the path for <bundle_path>
// * get client_token from the token generator
// * have a "vector" keyspace in your database (astra doesn't allow creating keyspaces with the drivers)

const aclient = new cassandra.Client({
    cloud: { secureConnectBundle: process.env.ASTRA_DB_SECURE_BUNDLE_PATH },
    credentials: { username: 'token', password: process.env.ASTRA_DB_APPLICATION_TOKEN }
});


async function run(c) {
    let query_quote = "How did Juliet die?"
    let result = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: query_quote
    })
    let embedding = new Float32Array(result.data[0].embedding)

    console.log(embedding)

    const query = "SELECT playerline, player, embedding_vector FROM vector.shakespeare_cql ORDER BY embedding_vector ANN OF ? LIMIT 1;"
    const result_rows = await aclient.execute(query, embedding, { prepare: true })

    for (let result_row in result_rows) {
        console.log("HERE")
        console.log(result_row)
    }

    await c.shutdown();
}

run(aclient)