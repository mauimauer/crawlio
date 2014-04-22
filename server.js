var googleapis = require('googleapis'),
	request = require('superagent'),
	TimeQueue = require('timequeue');

var checkedVideos = {};
var checkedShortlinks = {};
var API_KEY = "api key here";

// Google Developers, Android Developers,
// Google, Talks at Google, Chrome, Fiber,
// Life at Google, Google Web Designer, Google Glass, Google Music
// Google for Entrepreneuers, Analatics, Google Stories, Google Ads, Google Webmasters, Google Ideas
// 
var channels = [ 'UCVHFbqXqoYvEWM1Ddxl0QDg',
	'UC_x5XG1OV2P6uZZ5FSM9Ttw',
	'UCK8sQmJBp8GCxrOtXWBpyEA',
	'UCbmNph6atAoGfqLoCL_duAg',
	'UCL8ZULXASCc1I_oaOT0NaOQ',
	'UCg44zX42-GjMr5XqyK3RmsQ',
	'UCWIzrKzN4KY6BPU8hsk880Q',
	'UC2FYFz_AQaKBMyrZe1Rrqyg',
	'UCxqyBoACUss6OxFdmFvxcXQ',
	'UCRG995aecKuNn4jYST0I2Ng',
	'UCkWLGZL69LhjjgGRKhcAE_w',
	'UCJ5UyIAa5nEGksjcdp43Ixw',
	'UCvceBgMIpKb4zK1ss-Sh90w',
	'UCgl9rHdm9KojNRWs56QI_hg',
	'UCWf2ZlNsCGDS89VBF_awNvA',
	'UCfhRDfX2gPf8kz52pLGpcgQ',
	'UC6fUahKiPDn1-3476TU-ovA',
	'UCt84aUC9OG6di8kSdKzEHTQ',
	'UCTnRxVUPssiL7H29ON07t_Q',
	'UCtyYTpFBzWdoSFx2Gl2VNbQ',
	'UCc688n0naRh68-n5LSiVNFA',
	'UC51bU7uJjsdcIEUzY1HHZsA',
	'UCBmwzQnSoj9b6HzNmFrg_yw',
	'UCUjlPym2cxucUVPdE8kYOOg',
	'UCWZeRDL6a3QTAd1FSz3Tmjg',
	'UC0_ALFRaovsmae1Y8bILisQ',
	'UCnIQPPwWpO_EFEqLny6TFTw'];

var processedShortLinks = 0;
var processedVideos = 0;

var client = null;

googleapis
	.discover('urlshortener', 'v1')
	.discover('youtube', 'v3')
	.execute(function(err, cl) {
		if(!err && cl) {
			client = cl;
			crawlVideos(client);
		}
	});


function worker(type, arg1, arg2, arg3, callback) {
	if(type == "browse") {
		if(arg2) {
			browsePlaylist(client, arg1, arg2, callback);
		} else {
			browsePlaylist(client, arg1, null, callback);
		}
	} else if(type == "video") {
		checkVideo(client, arg1, callback);
	} else if(type == "shortlink") {
		checkShortlink(client, arg1, callback);
	}
}
var q = new TimeQueue(worker, { concurrency: 1, every: 1000 });


function crawlVideos(client) {
	for(var i = 0; i < channels.length; i++) {
		var channel = channels[i];
		var params = {
			id: channel,
			part: "id,contentDetails"
		};
		var req = client.youtube.channels.list(params).withApiKey(API_KEY);
		req.execute(function(err, response) {

			if(response) {
				var uploadsList = response.items[0].contentDetails.relatedPlaylists.uploads;
				if(uploadsList) {
					q.push("browse", uploadsList);
				}
			}
		});
	};
}

function browsePlaylist(client, playlistId, pageToken, callback) {
	var params = {
		part: "id,contentDetails",
		playlistId: playlistId,
		maxResults: 50
	};

	if(pageToken) {
		params['pageToken'] = pageToken;
	}

	var req = client.youtube.playlistItems.list(params).withApiKey(API_KEY);
	req.execute(function(err, response) {

		for(var i = 0; i < response.items.length; i++) {
			var videoId = response.items[i].contentDetails.videoId;

			q.push("video", videoId);
		}

		if(response.nextPageToken) {
			q.push("browse", playlistId, response.nextPageToken);
		}
		callback();
	});
}

function checkVideo(client, videoId, callback) {
	processedVideos++;
	if(!checkedVideos[videoId]) {
		checkedVideos[videoId] = 1;
		request.get("https://www.youtube.com/annotations_invideo?features=1&legacy=1&video_id="+videoId, function(res) {
			var regex = /(goo.gl\/[a-zA-Z0-9]{6,})/;
			var matches = res.text.match(regex);

			if(matches) {
				for(var i = 0; i < matches.length; i++) {
					q.push("shortlink", matches[0]);
				}
			}
		});
	}
	callback();
}

function checkShortlink(client, shortLink, callback) {
	processedShortLinks++;
	if(!checkShortlink[shortLink]) {
		checkShortlink[shortLink] = 1;

		var params = {
			shortUrl: "http://"+shortLink,
			projection: "ANALYTICS_CLICKS"
		};
		var req = client.urlshortener.url.get(params).withApiKey(API_KEY);
		req.execute(function(err, response) {
			if(err) {
				console.log("checkShortlink failed");
				console.log(err);
				delete checkShortlink[shortLink];
			} else {
				if(response.longUrl.indexOf("redeem") != -1) {
					if(response.analytics.allTime.shortUrlClicks < 5) {
						console.log(response.analytics.allTime.shortUrlClicks + ": "+shortLink + " -> "+ response.longUrl);
					} else {
						console.log("redeem, "+ shortLink + " is stale, views: "+ response.analytics.allTime.shortUrlClicks);
					}
				}
			}
		});
	}
	callback();
}
