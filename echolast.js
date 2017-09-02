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
  config.CLIENTID = process.env.CLIENTID
  config.CLIENTSECRET = process.env.CLIENTSECRET
  config.LASTKEY = process.env.LASTKEY
  config.LASTSEC = process.env.LASTSEC
  config.LASTUSR = process.env.LASTUSR
  config.LASTSES = process.env.LASTSES
}

var app = express();
var authCode = '';

// Set express settings
app.use(compression());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 604800000 }));
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

console.log('Express initialized');

// Start the server
app.listen(process.env.PORT || 5000, function(){
  console.log("Node app is running. Better go catch it.");
});

var scopes = ['user-read-playback-state', 'user-library-read', 'user-read-private', 'user-library-modify', 'user-read-currently-playing', 'user-modify-playback-state'];
var domain = 'http://localhost:5000';
var domainesc = 'http:%2F%2Flocalhost:5000';
if (process.env.NODE_ENV === 'prod') {
  domain = 'http://penncoursesearch.com/last';
  domainesc = 'http:%2F%2Fpenncoursesearch.com%2Flast';
}

// Handle main page requests
app.get('/login', function(req, res) {
  res.redirect('https://accounts.spotify.com/authorize' + 
    '?response_type=code' +
    '&client_id=' + config.CLIENTID + 
    '&scope=user-read-playback-state%20user-library-read%20user-read-private%20user-library-modify%20user-read-currently-playing%20user-modify-playback-state' +
    '&redirect_uri=' + domainesc + '%2Fcallback%2F');
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
var currentTempo = 0;
var lastReady = false;

app.get('/callback/', function(req, res) {
  // console.log(req.query.code);
  authCode = req.query.code
  GetAccessToken(authCode);
  return res.send('good');
});

var lfm = new LastfmAPI({
  'api_key' : config.LASTKEY,
  'secret' : config.LASTSEC
});

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

app.get('/tempo/', function(req, res) {
	if (spotifyApi.getAccessToken()) {						
    spotifyApi.getMyCurrentPlaybackState()
		.then(function(data) {
      if (data.body.is_playing) {	
  			var spotid = data.body.item.id;
	   		spotifyApi.getAudioFeaturesForTrack(spotid)
        .then(function(data) {
    		 	return res.send(data.body.tempo.toString());
  			}, function(err) {
          console.log('Tempo error: ' + err);
        });
			}
		});
	}
});

lfm.setSessionCredentials(config.LASTUSR, config.LASTSES);

/* Set the credentials given on Spotify's My Applications page.
 * https://developer.spotify.com/my-applications
//  */
var spotifyApi = new SpotifyWebApi({
  clientId: config.CLIENTID,
  clientSecret: config.CLIENTSECRET,
  redirectUri: domain + '/callback/'
});

// // First retrieve an access token

function GetAccessToken(theAuthCode) {
  spotifyApi.authorizationCodeGrant(theAuthCode)
    .then(function(data) {
      // console.log('Retrieved access token', data.body['access_token']);

      // Set the access token
      spotifyApi.setAccessToken(data.body['access_token']);
      spotifyApi.setRefreshToken(data.body['refresh_token']);

      // Save the amount of seconds until the access token expired
      tokenExpirationEpoch = (new Date().getTime() / 1000) + data.body['expires_in'];
      // console.log('Retrieved token. It expires in ' + Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) + ' seconds!');
     
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
              console.log('Scrobbled:', scrobbles);
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
            console.log('Updated now playing:', scrobbles);
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
    .catch(function(err) {
      console.log(err);
      spotifyApi.refreshAccessToken()
      .then(function(data) {
        // Save the access token so that it's used in future calls
        spotifyApi.setAccessToken(data.body['access_token']);
      }, function(err) {
        console.log('Could not refresh access token', err);
        GetAccessToken(authCode);
      });
    })
  } else {
    spotifyApi.refreshAccessToken()
    .then(function(data) {
      // Save the access token so that it's used in future calls
      spotifyApi.setAccessToken(data.body['access_token']);
    }, function(err) {
      console.log('Could not refresh access token', err);
      GetAccessToken(authCode);
    });
  }
}, 5000);
