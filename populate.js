'use strict';
import OpenAI from "openai";
import dotenv from 'dotenv';
import quote_array from './shakespeare.json' assert { type: "json" };;

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAPI_API_KEY
})

import cassandra from '../nodejs-driver/index.js';

// This works with astra, but it's necessary to do a few things:
// * get bundle and include the path for <bundle_path>
// * get client_id and client_secret from the token generator
// * have a "test" keyspace in your database (astra doesn't allow creating keyspaces with the drivers)

const aclient = new cassandra.Client({
    cloud: { secureConnectBundle: process.env.ASTRA_DB_SECURE_BUNDLE_PATH },
    credentials: { username: 'token', password: process.env.ASTRA_DB_APPLICATION_TOKEN }
});

async function run(c) {
    try {

        // Setup 
        await c.connect()
            .then(() => c.execute("drop table IF EXISTS vector.shakespeare"))
            .then(() => c.execute("CREATE TABLE IF NOT EXISTS vector.shakespeare (dataline INT PRIMARY KEY, player TEXT, playerline TEXT, embedding_vector VECTOR<FLOAT, 1536>)"))
            .then(() => c.execute("create custom index IF NOT EXISTS shakespeare_index on vector.shakespeare(embedding_vector) using 'StorageAttachedIndex'"));
    }
    catch (err) {
        console.log("It looks bad, Jim");
        console.log(err);
    }
    // Now load all of the quotes into the database

    for (var index = 0; index < quote_array.length; index++) {
        if (quote_array[index].Play != "Romeo and Juliet") {
            continue
        }

        let quote_id = quote_array[index]["Dataline"]
        let previous_quote = (index > 0) ? quote_array[index - 1]["PlayerLine"] : ""
        let next_quote = (index < quote_array.length) ? quote_array[index + 1]["PlayerLine"] : ""

        let quote_input = previous_quote + "\n" + quote_array[index]["PlayerLine"] + "\n" + next_quote
        let result = await openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: quote_input
        })
        console.log(quote_array[index].Play + " : " + quote_array[index].PlayerLine)

        await c.execute(`INSERT INTO vector.shakespeare (dataline, player, playerline, embedding_vector) VALUES (?, ?, ?, ?)`, [cassandra.types.Integer.fromInt(index), quote_array[index]["Play"], quote_array[index]["PlayerLine"], new Float32Array(result["data"][0]["embedding"])], { prepare: true })
    }

    await c.shutdown();
}
run(aclient)