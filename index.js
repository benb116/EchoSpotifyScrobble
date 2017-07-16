var SpotifyWebApi = require('spotify-web-api-node');
var path        = require('path');
var express     = require('express');
var compression = require('compression');
var request     = require('request');

var config;
try {
  config = require('./config.js');
} catch (err) { // If there is no config file
  config = {};
}

var app = express();

// Set express settings
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 604800000 }));

console.log('Express initialized');

// Start the server
app.listen(process.env.PORT || 5000, function(){
  console.log("Node app is running. Better go catch it.");
});

var scopes = ['user-read-playback-state', 'user-library-read', 'user-read-private', 'user-library-modify', 'user-read-currently-playing', 'user-modify-playback-state'];

// Handle main page requests
app.get('/login', function(req, res) {
  res.redirect('https://accounts.spotify.com/authorize' + 
    '?response_type=code' +
    '&client_id=' + config.CLIENTID + 
    '&scope=user-read-playback-state%20user-library-read%20user-read-private%20user-library-modify%20user-read-currently-playing%20user-modify-playback-state' +
    '&redirect_uri=http:%2F%2Flocalhost:5000%2Fcallback%2F');
});

var authCode = '';
var access_token = '';
var refresh_token = '';

app.get('/callback/', function(req, res) {
  console.log(req.query.code);
  var authCode = req.query.code
  GetAccessToken(authCode);
  return res.send('good');
});


/* Set the credentials given on Spotify's My Applications page.
 * https://developer.spotify.com/my-applications
//  */
var spotifyApi = new SpotifyWebApi({
  clientId: config.CLIENTID,
  clientSecret: config.CLIENTSECRET,
  redirectUri: 'http://localhost:5000/callback/'
});

// // First retrieve an access token

function GetAccessToken(authCode) {
  spotifyApi.authorizationCodeGrant(authCode)
    .then(function(data) {
      console.log('Retrieved access token', data.body['access_token']);

      // Set the access token
      spotifyApi.setAccessToken(data.body['access_token']);

      // Use the access token to retrieve information about the user connected to it
      return spotifyApi.getMyCurrentPlaybackState();
    })
    .then(function(data) {
      console.log(data)

      if (data.body.is_playing && data.body.device.name === 'Ben\'s Echo Dot') {
        console.log('Scrobble')
        console.log(data.body.item.name)
      }
    })
    .catch(function(err) {
      console.log('Something went wrong', err.message);
   });
}