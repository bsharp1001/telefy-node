var http = require('http');

var options = {
  host: proccess.env.app_url,
};

callback = function(response) {
  var str = '';
  response.on('end', function () {
    console.log(str);
    process.exit();
  });
}

http.request(options, callback).end();