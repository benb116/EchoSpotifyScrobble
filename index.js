var SpotifyWebApi = require('spotify-web-api-node');
var LastfmAPI = require('lastfmapi');
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
var latestSpotID = '';
var lastDuration = 0;
var lastartist = '';
var lasttrack = '';
var lastalbum = '';
var lastthresh = 12;

var lastReady = false;

app.get('/callback/', function(req, res) {
  // console.log(req.query.code);
  var authCode = req.query.code
  GetAccessToken(authCode);
  return res.send('good');
});

var lfm = new LastfmAPI({
  'api_key' : config.LASTKEY,
  'secret' : config.LASTSEC
});

var lastAuthUrl = lfm.getAuthenticationUrl({ 'cb' : 'http://localhost:5000/lastcall/' });
console.log(lastAuthUrl)

app.get('/lastcall/', function(req, res) {
  var token = req.query.token;
  lfm.authenticate(token, function (err, session) {
    if (err) { throw err; }
    lastReady = true;
    config.LASTSES = session.THE_USER_SESSION_KEY;
    console.log(session); // {"name": "LASTFM_USERNAME", "key": "THE_USER_SESSION_KEY"}
  });
  return res.send('last-good');
});

lfm.setSessionCredentials(config.LASTUSR, config.LASTSES);

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
      // console.log('Retrieved access token', data.body['access_token']);

      // Set the access token
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);

      // Save the amount of seconds until the access token expired
      tokenExpirationEpoch = (new Date().getTime() / 1000) + data.body['expires_in'];
      console.log('Retrieved token. It expires in ' + Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) + ' seconds!');
     
    })
    .catch(function(err) {
      console.log('Something went wrong', err.message);
   });
}

setInterval(function() {
  if (!config.LASTSES) {
    console.log('yes')
  }
  if (spotifyApi.getAccessToken()) {
    spotifyApi.getMyCurrentPlaybackState()
    .then(function(data) {

      if (data.body.is_playing && data.body.device.name === 'Ben\'s Echo Dot') {
        if (data.body.item.uri != latestSpotID) {
          latestSpotID = data.body.item.uri;
          if (lastDuration > lastthresh) {
            lfm.track.scrobble({
              'artist' : lastartist,
              'album' : lastalbum,
              'track' : lasttrack,
              'timestamp' : Math.floor((new Date()).getTime() / 1000)
            }, function (err, scrobbles) {
              if (err) { return console.log('We\'re in trouble', err); }
              console.log('We have just scrobbled:', scrobbles);
            });
          }

          lastthresh = data.body.item.duration_ms / 5000 * 0.75;

          lfm.track.updateNowPlaying({
            'artist' : data.body.item.artists[0].name,
            'album' : data.body.item.album.name,
            'track' : data.body.item.name,
            'timestamp' : Math.floor((new Date()).getTime() / 1000)
          }, function (err, scrobbles) {
            if (err) { return console.log('We\'re in trouble', err); }
            console.log('We have just updated now playing:', scrobbles);
          });

          lastDuration = 0;
          lastartist = data.body.item.artists[0].name;
          lastalbum = data.body.item.album.name;
          lasttrack = data.body.item.name;

        } else {
          lastDuration++;
        }
      }
    })
  } else {
    spotifyApi.refreshAccessToken()
      .then(function(data) {
        tokenExpirationEpoch = (new Date().getTime() / 1000) + data.body['expires_in'];
        console.log('Refreshed token. It now expires in ' + Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) + ' seconds!');
      }, function(err) {
        console.log('Could not refresh the token!', err.message);
      });
    console.log('no token')
  }
}, 5000);