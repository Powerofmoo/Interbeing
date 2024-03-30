import {fetch} from 'wix-fetch';
import wixData from 'wix-data';
import {getSecret} from 'wix-secrets-backend';
import axios from "axios";

import {OpenAI, toFile} from "openai";

const BOT_TOKEN = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}`;
const apiFileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

import {getWarmData, saveWarmData} from 'backend/astraDB.jsw';

export async function formulateBotReply(chat, message)
{
    const chatId = chat.id;
    const messId = message.message_id;

    const isPrivate = (chat.id > 0);
    const groupText = (isPrivate ? "(private chat), chatid:" + chatId : chat.title) + ", ";

    const userid = message.from.id;
    const username = message.from.first_name + " " + message.from.last_name;
    const augmentedText = (!isPrivate ? groupText + username + ": " : "");         // no augmented text for private chat
    const augmentedKeys = "telegram, " + groupText + username + ", ";

    var responseStored = false;

    // generative commands
    if (message.text == "/poem") {
        await sendBotStatus(chatId, "typing");

        var retValue = await getWarmData("i am");   
        
        const openai = new OpenAI({ apiKey: await getSecret("OPENAI_API_KEY") });
        const aiQuery = "write a poem in the I am form based on " + retValue + ", end with 'I am Moos'";
               
        console.log(aiQuery);

        const completion = await openai.chat.completions.create({
          messages: [
              { role: "system", content: "You are a mystic poet."},
              { role: "user", content: aiQuery },

          ],
          model: "gpt-3.5-turbo",
        });
        
        await sendBotReaction(chatId, messId, "👍");

        return "_" + completion.choices[0].message.content + "_";
    }

    // handle voice input
    if (isPrivate && message.voice) {

        await sendBotStatus(chatId, "typing");

        // Get file url  from telegram
        const payLoad = {
            method: 'POST',
            headers: {
                'Content-type': 'application/json'
            },
            body: JSON.stringify({
                'file_id': message.voice.file_id
            })};
        const fileLookup = await fetch(apiUrl + '/getFile', payLoad).then(response => response.json());
        const fileUrl = apiFileUrl + "/" + fileLookup.result.file_path;

        // we need axios here, standard fetch wont work
        const response = await axios({
          method: 'get',
          url: fileUrl,
          responseType: 'stream'
        });

        // transcribe in OpenAI
        const openai = new OpenAI({ apiKey: await getSecret("OPENAI_API_KEY") });

        const transcription = await openai.audio.transcriptions.create({
            file: await toFile(response.data, "text.oga"),
            model: "whisper-1",
            // language: "eng", // this is optional but helps the model
        });

        if (!transcription.text) return;

        // await sendBotReaction(chatId, messId, "👍");

        const analysis = { mood: "neutral", keywords: augmentedKeys + "speech"};
        await saveWarmData(augmentedText + transcription.text, analysis);

        responseStored = true;
    }

    // start counts for response
    if ( message.text?.trim() == "/start") responseStored = true;

    // handle text (no commands)
    if (isPrivate && message.text && Array.from( message.text.trim() )[0] != "/" ) {

          await sendBotStatus(chatId, "typing");
          // await sendBotReaction(chatId, messId, "👍");

          const analysis = { mood: "neutral", keywords: augmentedKeys};
          await saveWarmData(augmentedText + message.text, analysis);   

          responseStored = true;
    } else {
      // in group - only pickup certain tags
      if (message.text?.includes("#love")) {
          await sendBotStatus(chatId, "typing");
          await sendBotReaction(chatId, messId, "❤️");

          const analysis = { mood: "neutral", keywords: augmentedKeys + "love"};
          await saveWarmData(augmentedText + message.text, analysis);   
    }

      if (message.text?.includes("#journal")) {
          await sendBotStatus(chatId, "typing");
          await sendBotReaction(chatId, messId, "✍️");

          const analysis = { mood: "neutral", keywords: augmentedKeys + "journal"};
          await saveWarmData(augmentedText + message.text, analysis);   
    }

      if (message.text?.includes("#event")) {
          sendBotStatus(chatId, "typing");
          sendBotReaction(chatId, messId, "👍");

          const analysis = { mood: "neutral", keywords: augmentedKeys + "event"};
          await saveWarmData(augmentedText + message.text, analysis);      
      }

      if (message.text?.includes("#resource")) {
          sendBotStatus(chatId, "typing");
          sendBotReaction(chatId, messId, "👍");

          const analysis = { mood: "neutral", keywords: augmentedKeys + "resource"};
          await saveWarmData(augmentedText + message.text, analysis);   
      }
    }

    // dependent on number of uses, answer some whispers for Interbeing
    if (responseStored) {
      const counter = await _storeInterbeingInteraction(userid, username, chatId);

      // first 2 whispers are by default
      switch (counter) {
        case 1: return _italic("As you enter the chat room, it seems empty, yet you sense an invisible presence of interconnected stories and emotions, a silent chorus of existence known as interbeing 🌐💫. This space, devoid of physical presence, hums with the essence of shared life, inviting you to contribute your narrative, your words, your voice 📖🤝. Driven by an inexplicable urge, you articulate your feelings, your intuition and your thoughts on this vast network of lives intertwined, casting your words, your voice into the collective memory ... without the expectation of a direct reply 🗣️🌍💭.");
        case 2: return _italic("Your contribution, though met with silence, becomes part of the room's fabric, intertwining with the unseen stories of others 🤲🕸️. In this act of sharing, you connect to the shared consciousness, a silent acknowledgment of the interbeing that binds us all 🌎❤️. Wanna share more? Either in words or with voice? 🗨️✨");
      }

      // after that, some random whisper from database
      const textRecord = await randomInterbeingText("MoosBotInterbeingTexts");
      if (textRecord) return _italic( textRecord.text );
    
      // error
      return _italic("...");
    }

    return null;
}

function _italic(text) {
  return  ( "_(" + text + ")_" ); 
}
/////////////////////////////
//
// database functions
//
/////////////////////////////

export async function addInterbeingText(text) {

  let lines = text.split('\n');

  // Looping through each line
  for (let line of lines) {
    console.log(line)
    const newText = {
      "text": line
    };
    wixData.insert("MoosBotInterbeingTexts", newText);
    return lines.length;
  }
}

export async function randomInterbeingText(collectionName = "MoosBotInterbeingTexts") {
    // Step 1: Get the total count of records in the collection
    const totalRecords = await wixData.query(collectionName)
                                      .count();
    if (totalRecords === 0) {
        return null; // No records to return
    }
    
    // Step 2: Generate a random index
    const randomIndex = Math.floor(Math.random() * totalRecords);
    
    // Step 3: Fetch a random record using .skip() and .limit()
    const result = await wixData.query(collectionName)
                                .skip(randomIndex)
                                .limit(1)
                                .find();

    // Assuming there is at least one record, return the first one found after skipping
    return result.items.length > 0 ? result.items[0] : null;
}


async function _storeInterbeingInteraction(userid, username, chatid) {
  const queryResult = await wixData.query("MoosInterbeing")
    .eq("userid", "" + userid)
    .find();

  if (queryResult.items.length > 0) {
    // User exists, update call count
    let user = queryResult.items[0];
    user.counter += 1;
    wixData.update("MoosInterbeing", user);
    return user.counter;
  } else {
    // New user, add to database
    const newUser = {
      "userid": "" + userid,
      "username": username,
      "chatid": "" + chatid,
      "counter": 1
    };
    wixData.insert("MoosInterbeing", newUser);
    return 1;
  }
}

///////////////////////////////////////
//
// send text/reaction/status
//
///////////////////////////////////////

export async function sendBotMessage(chatId, text) {

  const httpResponse = await fetch(apiUrl + `/sendMessage`, {
    'method': 'post',
    'headers': {
      'Content-type': 'application/json'
    },
    'body': JSON.stringify({
      'chat_id': chatId,
      'text': text,
      'parse_mode': "Markdown"
    })
  });
  if (httpResponse.ok) {
    return httpResponse.json();
  }
  return false;
}


export async function sendBotReaction(chatId, messId, emoji) {
  const httpResponse = await fetch(apiUrl + `/setMessageReaction`, {
    'method': 'post',
    'headers': {
      'Content-type': 'application/json'
    },
    'body': JSON.stringify({
      'chat_id': chatId,
      'message_id': messId,
      'reaction': [{ "type": "emoji", "emoji": emoji}]
    })
  });

  if (httpResponse.ok) {
    return httpResponse.json();
  }
  return false;
}


export async function sendBotStatus(chatId, status) {
  const httpResponse = await fetch(apiUrl + `/sendChatAction`, {
    'method': 'post',
    'headers': {
      'Content-type': 'application/json'
    },
    'body': JSON.stringify({
      'chat_id': chatId,
      'action': status
    })
  });
  if (httpResponse.ok) {
    return httpResponse.json();
  }
  return false;
}