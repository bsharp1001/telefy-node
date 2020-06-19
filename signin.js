const { MTProto, getSRPParams } = require('@mtproto/core');
const readline = require('readline');
const mysql = require('mysql');
var LocalStorage = require('node-localstorage').LocalStorage,
localStorage = new LocalStorage('./data');

//var connection = mysql.createConnection({
//  host     : process.env.DATABASE_URL
//});
var connection;
function handleDisconnect() {
  connection = mysql.createConnection(process.env.DATABASE_URL); // Recreate the connection, since
                                                  // the old one cannot be reused.

  connection.connect(function(err) {              // The server is either down
    if(err) {                                     // or restarting (takes a while sometimes).
      //console.log('error when connecting to db:', err);
      setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
    }                                     // to avoid a hot loop, and to allow our node script to
  });                                     // process asynchronous requests in the meantime.
                                          // If you're also serving http, display a 503 error.
  connection.on('error', function(err) {
    //console.log('db error', err);
    if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
      handleDisconnect();                         // lost due to either server restart, or a
    } else {                                      // connnection idle timeout (the wait_timeout
      throw err;                                  // server variable configures this)
    }
  });
}

handleDisconnect();
//connection.connect();

var values = [];

var mtproto;

const state = {
  phone: null,
  phoneCodeHash: null,
  code: null,
  password: null,
};

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question(question, input => {
      rl.close();

      resolve(input);
    });
  });
}
function sendCode(phone, options) {
//console.log(`phone:`, phone);

  state.phone = phone;

  return mtproto
    .call(
      'auth.sendCode',
      {
        phone_number: state.phone,
        settings: {
          _: 'codeSettings',
        },
      },
      options
    )
    .then(result => {
//console.log(`result.phone_code_hash:`, result.phone_code_hash);
      state.phoneCodeHash = result.phone_code_hash;
      return result;
    });
}

function signIn(code, options) {
  state.code = code;
//console.log(`code:`, code);

  return mtproto.call(
    'auth.signIn',
    {
      phone_code: state.code,
      phone_number: state.phone,
      phone_code_hash: state.phoneCodeHash,
    },
    options
  );
}

function checkPassword(password, options) {
  state.password = password;

  return mtproto.call('account.getPassword', {}, options).then(async result => {
    const { srp_id, current_algo, secure_random, srp_B } = result;
    const { salt1, salt2, g, p } = current_algo;

    const { A, M1 } = await getSRPParams({
      g,
      p,
      salt1,
      salt2,
      gB: srp_B,
      password,
    });

    return mtproto.call(
      'auth.checkPassword',
      {
        password: {
          _: 'inputCheckPasswordSRP',
          srp_id,
          A,
          M1,
        },
      },
      options
    );
  });
}

function getFullUser(options) {
  return mtproto.call(
    'users.getFullUser',
    {
      id: {
        _: 'inputUserSelf',
      },
    },
    options
  );
}

function handleUpdates() {
  // updatesTooLong
  // updateShortMessage
  // updateShortChatMessage
  // updateShort
  // updates
  // updateShortSentMessage

  mtproto.updates.on('updateShort', message => {
//console.log(`message:`, message);
  });
}

function getNearestDc(options) {
  return mtproto.call('help.getNearestDc', {}, options);
}

function getConfig(options) {
  return mtproto.call('help.getConfig', {}, options);
}


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

connection.query('CREATE TABLE IF NOT EXISTS tele_users (username VARCHAR(255), email VARCHAR(255), name VARCHAR(255), chatid VARCHAR(255) PRIMARY KEY NOT NULL)', function (error, results, fields) {
  console.log(error)
  connection.query('CREATE TABLE IF NOT EXISTS tele_keys (unique_key VARCHAR(255) PRIMARY KEY NOT NULL, value LONGTEXT)', function (error, results, fields) {
    console.log(error)

rl.question("api id: ", (id) => {
  rl.close()
  values.push(["api_id",id]);
  const rl1 = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl1.question("api hash: ", (hash) => {
    rl1.close()
    values.push(["api_hash",hash]);
    const rl2 = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl2.question("bot token: ", (token) => {
      rl2.close()
      values.push(["bot_token",token]);
      const rl3 = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl3.question("phone : ", (phonenum) => {
        rl3.close()
        mtproto = new MTProto({
          api_id: id,
          api_hash: hash,
          test: false,
          customLocalStorage: localStorage,
        });
        const phone = phonenum

        getFullUser()
        .then(result => {
          //console.log(`result:`, result);
          //console.log("ghfjgj:" + mtproto.customLocalStorage.length);

          const rl6 = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          rl6.question("channelid without @: ", (channel) => {
            rl6.close()
            mtproto.call("contacts.resolveUsername", {
              username: channel
            })
            .then(result => {
              values.push(["channel",result.peer.channel_id]);
              //console.log(result.peer.channel_id);
              for (let index = 0; index < mtproto.customLocalStorage.length; index++) {
                const key = mtproto.customLocalStorage.key(index);
                var data =  [key, mtproto.customLocalStorage.getItem(key)];
                //console.log(mtproto.customLocalStorage.length, data);
                values.push(data);
              }
              //console.log(values);
              for (let index = 0; index < values.length; index++) {
              connection.query('INSERT INTO tele_keys (unique_key, value) VALUES ?', [values[index][0], JSON.stringify(values[index][1])], function (error, results, fields) {
                console.log(error);
              })
            }
            })
          })
          //console.log(values);
        })
        .catch(error => {
          console.log(`error:`, error);
      
          return sendCode(phone);
        })
        .catch(error => {
          console.log(`sendCode[error]:`, error);
      
          if (error.error_message.includes('_MIGRATE_')) {
            const [type, nextDcId] = error.error_message.split('_MIGRATE_');
      
            mtproto.setDefaultDc(+nextDcId);
      
            return sendCode(phone);
          }
        })
        .then(async () => {
          const code = await prompt('code: ');
      
          return signIn(code);
        })
        .catch(error => {
          console.log(`signIn[error]:`, error);
      
          if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
            return checkPassword(password);
          }
        })
        .then(result => {
//console.log(`signIn/checkPassword[result]:`, result);
      
          return getNearestDc({ dcId: 1 });
        })
        .then(result => {
          const rl7 = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          rl7.question("channelid without @: ", (channel) => {
            rl7.close()
            mtproto.call("contacts.resolveUsername", {
              username: channel
            })
            .then(result => {
              values.push(["channel",result.peer.channel_id]);
              console.log(result.peer.channel_id);
              //console.log(mtproto.customLocalStorage.length);
              for (let index = 0; index < mtproto.customLocalStorage.length; index++) {
                const key = mtproto.customLocalStorage.key(index);
                console.log(key);
                var data =  [key, mtproto.customLocalStorage.getItem(key)];
                values.push(data);
              }
              //console.log(values)
              for (let index = 0; index < values.length; index++) {
                connection.query('INSERT INTO tele_keys (unique_key, value) VALUES (?,?)', [values[index][0], JSON.stringify(values[index][1])], function (error, results, fields) {
                  console.log(error);
                })
              }
            })
          })
//console.log(`getNearestDc[result]:`, result);
          //console.log(mtproto.customLocalStorage.length);
        })
        .catch(error => {
          console.log(`error:`, error);
        });

        /*
        sendCode(phone)
        .catch(error => {
          if (error.error_message.includes('_MIGRATE_')) {
            const [type, nextDcId] = error.error_message.split('_MIGRATE_');
          
            mtproto.setDefaultDc(+nextDcId);
          
            return sendCode(phone, mtproto);
          }
        })
        .then(result => {
          const rl4 = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });
          rl4.question("code: ", (answer) => {
            rl4.close()
            return mtproto.call('auth.signIn', {
              phone_code: answer,
              phone_number: phone,
              phone_code_hash: result.phone_code_hash,
            })
            .then(result => {
              //console.log('auth.authorization:', result);
              return mtproto.call("contacts.resolveUsername", {
                username: "ddesd1001"
              })
              .then(result => {
//console.log(result.peer.channel_id);
                var values = [];
//console.log(localstorage.length);
                for (let index = 0; index < localstorage.length; index++) {
                  
                  const key = localstorage.key[index];
                  var data =  [key, localstorage.getItem(key)];
//console.log(localstorage.length, data);
                  values.push(data);
                }
//console.log(values);
                process.exit();
              })
              .catch( error =>{
//console.log(error.error_message);
                process.exit();
              })
              ;
            })
          })

        })
        .catch(error => {
          if (error.error_message === 'SESSION_PASSWORD_NEEDED') {
            return mtproto.call('account.getPassword').then(async result => {
              const { srp_id, current_algo, srp_B } = result;
              const { salt1, salt2, g, p } = current_algo;
              const rl5 = readline.createInterface({
                input: process.stdin,
                output: process.stdout
              });
              rl5.question("password: ", async (answer) => {
                rl5.close()
                const { A, M1 } = await getSRPParams({
                  g,
                  p,
                  salt1,
                  salt2,
                  gB: srp_B,
                  answer,
                });
              
                return mtproto.call('auth.checkPassword', {
                  password: {
                    _: 'inputCheckPasswordSRP',
                    srp_id,
                    A,
                    M1,
                  },
                })
                .then(result => {
//console.log('auth.authorization:', result);
                });
              });
            });
          }
        })*/
      });
    });
  });
});

});
  
});
//connection.query('SELECT email, name FROM users WHERE chatid=?', [username, chatId, chatId], function (error, results, fields) {})


  