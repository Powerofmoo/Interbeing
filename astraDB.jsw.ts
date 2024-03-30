import { AstraDB } from "@datastax/astra-db-ts";
import OpenAI from 'openai';

import {getSecret} from 'wix-secrets-backend';

function _getYearWeekNumber(d) {
    // Copy date so don't modify original
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    // Get first day of year
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    // Calculate full weeks to nearest Thursday
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    // Return array of year and week number
    return [d.getUTCFullYear(), weekNo];
}

export async function dumpWarmData( keyword = null )
{
        // astraDB
        const nameSpace = await getSecret("ASTRA_DB_NAMESPACE");

        const astraDb = new AstraDB(
            await getSecret("ASTRA_DB_APPLICATION_TOKEN"),
            await getSecret("ASTRA_DB_ENDPOINT"),
            nameSpace
        );
        const warmDataCollection = await astraDb.collection("warmdata");

        var filter = {};
        if (keyword) filter = {"keywords": keyword.toLowerCase() };

        var keyText = " ";
        if (keyword) keyText = " (" + keyword.toLowerCase() + ") ";

        // CURSOR ONLY WORKS THIS WAY (???) - hasNext/next doesnt work // for await (const doc of cursor) doesnt work
        var cursor = await warmDataCollection.find( filter  ) ;
        const dump = await cursor.toArray();
        var mesh = new Array();
        
        mesh.push("PDF of " + nameSpace + keyText + new Date().toUTCString());
        mesh.push ("=============================================================");
        dump.forEach((element) => { mesh.push(element.content); mesh.push("--");}  );

        return mesh;

}

export async function getWarmData( input, keyword = null )
{
        // vector here, or later(?)
        const openai = new OpenAI({
            apiKey: await getSecret("OPENAI_API_KEY")
        });
        const {data} = await openai.embeddings.create({input: input, model: 'text-embedding-ada-002'});

        // astraDB
        const astraDb = new AstraDB(
            await getSecret("ASTRA_DB_APPLICATION_TOKEN"),
            await getSecret("ASTRA_DB_ENDPOINT"),
            await getSecret("ASTRA_DB_NAMESPACE")
        );
        const warmDataCollection = await astraDb.collection("warmdata");

        // search
        const options = {
            sort: {
                $vector: data[0].embedding
            },
            limit: 5
        };

        var filter = {};
        if (keyword) filter = {"keywords": keyword };
        
        // CURSOR ONLY WORKS THIS WAY (???) - hasNext/next doesnt work // for await (const doc of cursor) doesnt work
        var cursor = await warmDataCollection.find( filter, options);
        const dump = await cursor.toArray();
        var mesh = new Array();
        dump.forEach((element) => mesh.push(element.content));

        return JSON.stringify(mesh);

}

export async function saveWarmData( content, analysis = null )
{

    var keywordsArray = analysis?.keywords.split(",").map(function(item) { return item.trim().toLowerCase(); });

    // add week code
    var yearWeek = _getYearWeekNumber(new Date());
    keywordsArray.push("wk" + yearWeek[0] + yearWeek[1]);

    try {
        // vector here, or later(?)
        const openai = new OpenAI({
            apiKey: await getSecret("OPENAI_API_KEY")
        });
        const {data} = await openai.embeddings.create({input: content, model: 'text-embedding-ada-002'});

        // vector DB part
        const astraDb = new AstraDB(
            await getSecret("ASTRA_DB_APPLICATION_TOKEN"),
            await getSecret("ASTRA_DB_ENDPOINT"),
            await getSecret("ASTRA_DB_NAMESPACE")
        );
        const warmDataCollection = await astraDb.collection("warmdata");

        let messageData = {
            $vector: data[0]?.embedding,
            content: content,
            length: content.length, // Capture the length of the message
            createdAt: new Date(), // Timestamp
            // Include analysis data if it exists, otherwise set to undefined
            mood: analysis?.mood,
            keywords: keywordsArray,
        };

        console.log ("Warm data: " + content);
        
        var res = await warmDataCollection.insertOne(messageData);
        return JSON.stringify(res);

    } catch (error) {
        return JSON.stringify(error);
    }

}