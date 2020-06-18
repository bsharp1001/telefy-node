const mysql = require('mysql');
const TelegramBot = require('node-telegram-bot-api');
const { MTProto } = require('@mtproto/core');
const storage = require('@mtproto/core/src/storage')
const utf8 = require('utf8');

var LocalStorage = require('node-localstorage').LocalStorage,
localStorage = new LocalStorage('/data');

var connection = mysql.createConnection({
  host     : process.env.DATABASE_URL,
});
 
connection.connect();

var token = '';
var id = '';
var hash = '';
var channelpeerId = '';

connection.query('SELECT * FROM keys')
.then ( error, results, fields => {

  for (let index = 0; index < results.length; index++) {
    if (results[index].key == "bot_token"){
      token = results[index].value
    } else {
      if (results[index].key == "api_id") {
        api_id = results[index].value
      } else {
        if (results[index].key == "api_hash") {
          api_hash = results[index].value
        } else {
          if (results[index].key == "channel") {
            channelpeerId = results[index].value
          } else {
            localStorage.setItem(results[index].key, results[index].value)
          }
        }
      }
    }
  }  
  // Create a bot that uses 'polling' to fetch new updates
  const bot = new TelegramBot(token, {polling: true});
  
  // Create mtproto instance
  const mtproto = new MTProto({
    api_id: id,
    api_hash: hash,
    test: false,
    customLocalStorage: localStorage,
  });
  
  bot.onText(/\/start/, (msg, match) => {
      // 'msg' is the received Message from Telegram
      // 'match' is the result of executing the regexp above on the text content of the message
       
      const chatId = msg.chat.id;
      const username = msg.chat.username;
      connection.query('INSERT INTO users (username, chatid) VALUES(?,?) ON CONFLICT(username) DO UPDATE SET chatid=?', [username, chatId, chatId], function (error, results, fields) {
          // error will be an Error if one occurred during the query
          // results will contain the results of the query
          // fields will contain information about the returned results fields (if any)
          
          // send back to the chat
          resp = "Great, a new friend. Always nice to have new friend, welcome. If you care to tell me more info about you type \n /add_info";
          
          bot.sendMessage(chatId, resp);
        });
      
    });
  
  bot.onText(/\/add_info/, (msg, match) => {
    
      const chatId = msg.chat.id;
      connection.query('SELECT email, name FROM users WHERE chatid=?', [username, chatId, chatId], function (error, results, fields) {
        var resp = "";
        var email = "";
        var name = "";
        if (results.length < 1) {
          resp = "Looks like you signed out of the service. Please type /start agin to re-apply first and become a friend again";
          } else {
            email = results[0].email
            name = results[0].name
            if (email == "" && name == "") {
              resp = "Perfect! it is always nice to know my friends better. Please, type your email in full valid form like this:\nname@example.com \n or if you don't want to type skip email"
            } else {
              if (email == "" && name != "") {
                resp = "Seems like You added your name but not your email. Please, type your email in full valid form like this:\nname@example.com or if you don't want to type skip email"
              } else {
                if (email != "" && name == "") {
                  resp = "Seems like You added your name but not your email. Please, type your name or if you don't want to type skip name"
                } else {
                  if (email != "" && name != "") {
                    resp = "Seems like You added your name but not your email. To update your info, start with your email... Please, type your email in full valid form like this:\nname@example.com or if you don't want to type skip email"
                  }
                }
              }
            }
          }
          bot.sendMessage(chatId, resp);
      });
  });
  
  bot.onText(/(^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$)/, (msg, match) => {
    const chatId = msg.chat.id;
    const email = msg.text;
    connection.query('UPDATE users SET email=? WHERE chatid=?', [email, chatId], function (error, results, fields) {
      bot.sendMessage(chatId, "Okay, your email is added. Now type your name like this: \n name: joe smith");
    })
  });
  
  bot.onText(/.*skip(.+)/, (msg, match) => {
    
    const chatId = msg.chat.id;
    if (match[1].trim().indexOf("email") != -1){
      bot.sendMessage(chatId, "okay no problem. Now type your name like this: \n name: joe smith");
    } else {
      if (match[1].trim().indexOf("name") != -1){
        bot.sendMessage(chatId, "okay no problem as you wish");
      }
    }

  });
  
  bot.onText(/.*name:(.+)/, (msg, match) => {
    
    const chatId = msg.chat.id;
    const name = match[1];
    connection.query('UPDATE users SET name=? WHERE chatid=?', [name, chatId], function (error, results, fields) {
      bot.sendMessage(chatId, "Okay, we're all set");
    })  
});

  bot.onText(/\/opt_out/, (msg, match) => {
    
      const chatId = msg.chat.id;
      bot.sendMessage(chatId, "Goodbyes hve always been hard \uD83E\uDD7A As you wish, you will stop receiving notifications from me");
      connection.query('DELETE FROM users WHERE chatid=?', [chatId], function (error, results, fields) {
      })
  });
  
  mtproto.updates.on('updateShort', message => {
      const { update } = message;
     
      if (update._ === 'updateNewMessage') {
        const { mes, pts, pts_count } = update;
        if (mes.to_id.peerChannel.channel_id === channelpeerId){
          console.log(mes.text);
          connection.query('SELECT chatid FROM users', [username, chatId, chatId], function (error, results, fields) {
            for (let index = 0; index < results.length; index++) {
              bot.sendMessage(results[index], mes.message);
            }
          })
        }
      }
  });
});
