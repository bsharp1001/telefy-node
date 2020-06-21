const mysql = require('mysql');
const TelegramBot = require('node-telegram-bot-api');
const { MTProto } = require('@mtproto/core');
const storage = require('@mtproto/core/src/storage')
const utf8 = require('utf8');
const http = require("http");
const port = process.env.PORT || 3000;
http.createServer(function (req, res) {
  res.write('Hello World!'); 
  res.end();
}).listen(port)

var LocalStorage = require('node-localstorage').LocalStorage,
  localStorage = new LocalStorage('./data');

var connection;
function handleDisconnect() {
  connection = mysql.createPool(process.env.CLEARDB_DATABASE_URL); // Recreate the connection, since
  // the old one cannot be reused.

  //connection.connect(function (err) {              // The server is either down
  //  if (err) {                                     // or restarting (takes a while sometimes).
  //    console.log('error when connecting to db:', err);
  //    setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
  //  }                                     // to avoid a hot loop, and to allow our node script to
  //});                                     // process asynchronous requests in the meantime.
  // If you're also serving http, display a 503 error.
  connection.on('error', function (err) {
    console.log('db error', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
      handleDisconnect();                         // lost due to either server restart, or a
    } else {                                      // connnection idle timeout (the wait_timeout
      throw err;                                  // server variable configures this)
    }
  });
}

handleDisconnect();

var token = '';
var id = '';
var hash = '';
var channelpeerId = '';

connection.query('SELECT * FROM tele_keys', (error, results, fields) => {
console.log(error)

  for (let index = 0; index < results.length; index++) {
    if (results[index].unique_key == "bot_token") {
      token = JSON.parse(results[index].value)
    } else {
      if (results[index].unique_key == "api_id") {
        id = parseInt(JSON.parse(results[index].value))
      } else {
        if (results[index].unique_key == "api_hash") {
          hash = JSON.parse(results[index].value)
        } else {
          if (results[index].unique_key == "channel") {
            channelpeerId = JSON.parse(results[index].value)

          } else {
            localStorage.setItem(results[index].unique_key, JSON.parse(results[index].value))
          }
        }
      }
    }
  }
  // Create a bot that uses 'polling' to fetch new updates
  const bot = new TelegramBot(token, { polling: true });
  console.log(channelpeerId)
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
    connection.query('INSERT IGNORE INTO tele_users (username, chatid) VALUES(?,?)', [username, chatId, chatId], function (error, results, fields) {
      // error will be an Error if one occurred during the query
      // results will contain the results of the query
      // fields will contain information about the returned results fields (if any)

      // send back to the chat
      console.log(error)
      resp = "Great, a new friend. Always nice to have new friend, welcome. If you care to tell me more info about you type \n /add_info";

      bot.sendMessage(chatId, resp);
    });

  });
  bot.on("polling_error", (msg) => console.log(msg));
  bot.onText(/\/add_info/, (msg, match) => {
    const chatId = msg.chat.id;
    connection.query('SELECT email, name FROM tele_users WHERE chatid=?', [chatId, chatId], function (error, results, fields) {
      console.log(error)
      console.log(results)
      var resp = "";
      var email = "";
      var name = "";
      if (results.length < 1) {
        resp = "Looks like you signed out of the service. Please type /start agin to re-apply first and become a friend again";
        bot.sendMessage(chatId, resp);
      } else {
        email = results[0].email
        name = results[0].name
        if (email == null && name == null) {
          resp = "Perfect! it is always nice to know my friends better. Please, type your email in full valid form like this:\nname@example.com \n or if you don't want to type skip email"
          bot.sendMessage(chatId, resp);
        } else {
          if (email == null && name != null) {
            resp = "Seems like You added your name but not your email. Please, type your email in full valid form like this:\nname@example.com\n or if you don't want to type skip email"
            bot.sendMessage(chatId, resp);
          } else {
            if (email != null && name == null) {
              resp = "Seems like You added your email but not your name. Please, type your name like this: \n name: joe smith\n or if you don't want to type skip name"
              bot.sendMessage(chatId, resp);
            } else {
              if (email != null && name != null) {
                resp = "Seems like You already registered. To update your info, start with your email... Please, type your email in full valid form like this:\nname@example.com\n or if you don't want to type skip email"
                bot.sendMessage(chatId, resp);
              }
            }
          }
        }
      }

    });
  });

  //email regex
  bot.onText(/(^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$)/, (msg, match) => {
    const chatId = msg.chat.id;
    const email = msg.text;
    connection.query('UPDATE tele_users SET email=? WHERE chatid=?', [email, chatId], function (error, results, fields) {
      console.log(error)

      bot.sendMessage(chatId, "Okay, your email is added. Now type your name like this: \n name: joe smith\n or if you don't want to type skip name");
    })
  });

  bot.onText(/.*skip(.+)/i, (msg, match) => {

    const chatId = msg.chat.id;
    if (match[1].trim().indexOf("email") != -1) {
      bot.sendMessage(chatId, "okay no problem. Now type your name like this: \n name: joe smith");
    } else {
      if (match[1].trim().indexOf("name") != -1) {
        bot.sendMessage(chatId, "okay no problem as you wish");
      }
    }

  });

  //name regex
  bot.onText(/.*name:(.+)/i, (msg, match) => {

    const chatId = msg.chat.id;
    const name = match[1];
    connection.query('UPDATE tele_users SET name=? WHERE chatid=?', [name, chatId], function (error, results, fields) {
      console.log(error)
      bot.sendMessage(chatId, "Okay, we're all set");
    })
  });

  bot.onText(/\/opt_out/, (msg, match) => {

    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Goodbyes hve always been hard \uD83E\uDD7A As you wish, you will stop receiving notifications from me");
    connection.query('DELETE FROM tele_users WHERE chatid=?', [chatId], function (error, results, fields) {
      console.log(error)
    })
  });


  //neccessary to start receiving updates
  mtproto.call("updates.getState").then(result => {
    console.log(result);
  }).catch(error => {
    console.log(error);
  })


  //handle updates
  mtproto.updates.on('updates', message => {
    //console.log(message);
    const updates = message.updates;
    console.log(updates.length);
    for (let index = 0; index < updates.length; index++) {
      const update = updates[index];
      if (update._ === 'updateNewChannelMessage') {
        const mes = update.message;
        console.log(mes);
        console.log(mes.message);
        if (channelpeerId.indexOf(mes.to_id.channel_id) > -1) {
          connection.query('SELECT chatid FROM tele_users', function (error, results, fields) {
            console.log(error)
            console.log(results)
            for (let index = 0; index < results.length; index++) {
              bot.sendMessage(results[index].chatid, mes.message);
            }
          })
        }
      }
    }

  });
});
