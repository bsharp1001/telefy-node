var https = require('https');


callback = function(response) {
  var str = '';
  response.on('end', function () {
    console.log(str);
    process.exit();
  });
}

https.request(process.env.app_url, callback).end();
