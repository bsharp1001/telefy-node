const { MTProto, getSRPParams } = require('@mtproto/core');
const readline = require('readline');
const mysql = require('mysql');
var LocalStorage = require('node-localstorage').LocalStorage,
  localStorage = new LocalStorage('./data');

var connection;
function handleDisconnect() {
  connection = mysql.createConnection(process.env.CLEARDB_DATABASE_URL); // Recreate the connection, since
  // the old one cannot be reused.

  connection.connect(function (err) {              // The server is either down
    if (err) {                                     // or restarting (takes a while sometimes).
      //console.log('error when connecting to db:', err);
      setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
    }                                     // to avoid a hot loop, and to allow our node script to
  });                                     // process asynchronous requests in the meantime.
  // If you're also serving http, display a 503 error.
  connection.on('error', function (err) {
    //console.log('db error', err);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
      handleDisconnect();                         // lost due to either server restart, or a
    } else {                                      // connnection idle timeout (the wait_timeout
      throw err;                                  // server variable configures this)
    }
  });
}

handleDisconnect();

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
      state.phoneCodeHash = result.phone_code_hash;
      return result;
    });
}

function signIn(code, options) {
  state.code = code;

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
      values.push(["api_id", id]);
      const rl1 = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      rl1.question("api hash: ", (hash) => {
        rl1.close()
        values.push(["api_hash", hash]);
        const rl2 = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl2.question("bot token: ", (token) => {
          rl2.close()
          values.push(["bot_token", token]);
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

                const rl6 = readline.createInterface({
                  input: process.stdin,
                  output: process.stdout
                });
                rl6.question("channelids without @ seperated by comma\",\": ", async (channels) => {
                  rl6.close()
                  var channelist = channels.split(",");
                  var cp = []
                  console.log(channelist);
                  for (let index = 0; index < channelist.length; index++) {
                    const channel = channelist[index];
                    var x = await mtproto.call("contacts.resolveUsername", {
                      username: channel
                    });
                    console.log(x.peer.channel_id, channel);
                    cp.push(x.peer.channel_id);
                  }
                  console.log("done")
                  values.push(["channel", cp.join(",")]);
                  for (let index = 0; index < mtproto.customLocalStorage.length; index++) {
                    const key = mtproto.customLocalStorage.key(index);
                    var data = [key, mtproto.customLocalStorage.getItem(key)];
                    values.push(data);
                  }
                  for (let index = 0; index < values.length; index++) {
                    connection.query('INSERT INTO tele_keys (unique_key, value) VALUES ?', [values[index][0], JSON.stringify(values[index][1])], function (error, results, fields) {
                      console.log(error);
                    })
                  }
                })
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

                return getNearestDc({ dcId: 1 });
              })
              .then(result => {
                const rl7 = readline.createInterface({
                  input: process.stdin,
                  output: process.stdout
                });
                rl7.question("channelids without @ seperated by comma\",\": ", async (channels) => {
                  rl7.close()
                  var channelist = channels.split(",");
                  var cp = []
                  console.log(channelist);
                  for (let index = 0; index < channelist.length; index++) {
                    const channel = channelist[index];
                    var x = await mtproto.call("contacts.resolveUsername", {
                      username: channel
                    });
                    console.log(x.peer.channel_id, channel);
                    cp.push(x.peer.channel_id);
                  }
                  console.log("done")
                  values.push(["channel", cp.join(",")]);
                  for (let index = 0; index < mtproto.customLocalStorage.length; index++) {
                    const key = mtproto.customLocalStorage.key(index);
                    //console.log(key);
                    var data = [key, mtproto.customLocalStorage.getItem(key)];
                    //values.push(data);
                  }
                  for (let index = 0; index < values.length; index++) {
                    connection.query('INSERT INTO tele_keys (unique_key, value) VALUES (?,?)', [values[index][0], JSON.stringify(values[index][1])], function (error, results, fields) {
                      console.log(error);
                    })
                  }
                })
              })
              .catch(error => {
                console.log(`error:`, error);
              });
          });
        });
      });
    });

  });

});


