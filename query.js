'use strict';
import OpenAI from "openai";
import dotenv from 'dotenv';
import json from 'json';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
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
    let query_quote = process.argv[3]
    let result = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: query_quote
    })
    let embedding = new Float32Array(result.data[0].embedding)

    const query = "SELECT playerline, player, embedding_vector FROM vector.shakespeare_cql ORDER BY embedding_vector ANN OF ? LIMIT ?;"
    const result_set = await aclient.execute(query, [embedding, 100], { prepare: true })

    let completion_model_name = "gpt-3.5-turbo"

    let prompt = "Generate an answer to a question. Use only the information in the provided documents. If you don't know, just say you don't know, don't try to make up an answer. Answer with " + process.argv[2] + " words.\n\n"
    prompt += "REFERENCE TOPIC: \n" + query_quote + "\n\n"
    prompt += "ACTUAL EXAMPLES: \n"
    for (let row of result_set.rows) {
        prompt += " - " + row.playerline + "\n"
    }

    console.log(prompt)

    const completion = await openai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: completion_model_name,
        temperature: 0.7,
        max_tokens: 320,
    });

    console.log(JSON.stringify(completion.choices[0].message.content))
    await c.shutdown();
}

run(aclient)