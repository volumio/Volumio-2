'use strict';

var libQ = require('kew');
var libxmljs = require('libxmljs');
var unirest = require('unirest');
var cachemanager = require('cache-manager');
var memoryCache = cachemanager.caching({store: 'memory', max: 100, ttl: 10 * 60/* seconds */});
var mm = require('music-metadata');
var Client = require('node-ssdp').Client;
var xml2js = require('xml2js');
var http = require('http');
var browseDLNAServer = require(__dirname + '/dlna-browser.js');
var client;
var singleBrowse = false;
var debug = false;

// Define the ControllerUPNPBrowser class
module.exports = ControllerUPNPBrowser;
function ControllerUPNPBrowser (context) {
  var self = this;

  this.context = context;
  this.commandRouter = this.context.coreCommand;
  this.logger = this.context.logger;
  this.configManager = this.context.configManager;
  this.DLNAServers = [];
}

ControllerUPNPBrowser.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

ControllerUPNPBrowser.prototype.addToBrowseSources = function () {
  var data = {name: 'Media Servers', uri: 'upnp', plugin_type: 'music_service', plugin_name: 'upnp_browser', 'albumart': '/albumart?sourceicon=music_service/upnp_browser/dlnaicon.png'};
  this.commandRouter.volumioAddToBrowseSources(data);
};

ControllerUPNPBrowser.prototype.onStart = function () {
  var self = this;

  var singleBrowseConf = self.commandRouter.executeOnPlugin('music_service', 'mpd', 'getConfigParam', 'singleBrowse');
  if (singleBrowseConf == undefined) {
    singleBrowseConf = false;
  }
  singleBrowse = singleBrowseConf;
  if (!singleBrowseConf) {
    this.addToBrowseSources();
  }

  try {
    client = new Client();
  } catch (e) {
    self.log('SSDP Client error: ' + e);
  }

  client.on('response', function responseHandler (headers, code, rinfo) {
    if (headers != undefined && headers.LOCATION != undefined && headers.LOCATION.length > 0) {
      var urlraw = headers.LOCATION.replace('http://', '').split('/')[0].split(':');
      var server = {'url': 'http://' + urlraw[0], 'port': urlraw[1], 'endpoint': headers};
      var location = server;

      xmlToJson(headers.LOCATION, function (err, data) {
        try {
          if (err) {
            return self.logger.error(err);
          }

          var device = (data.root.device || [])[0];
          if (!device) {
            return;
          }

          var server = {};
          server.name = (device.friendlyName || [])[0];
          server.UDN = (device.UDN || [])[0] + '';
          try {
            var iconList = (device.iconList || [])[0] || {};
            var icon = (iconList.icon || [])[0] || {};
            var iconUrl = (icon.url || [])[0] || '';
            if (iconUrl.startsWith('//')) {
              iconUrl = 'http:' + iconUrl;
            }
            if (iconUrl.includes('://')) {
              server.icon = iconUrl;
            } else {
              if (!iconUrl.startsWith('/')) {
                iconUrl = '/' + iconUrl;
              }
              server.icon = 'http://' + urlraw[0] + ':' + urlraw[1] + iconUrl;
            }
          } catch (e) {
            server.icon = '/albumart?sourceicon=music_service/upnp_browser/dlnaicon.png';
          }
          server.lastTimeAlive = Date.now();
          server.location = location.url + ':' + location.port;

          var serviceList = (device.serviceList || [])[0] || {};
          var services = serviceList.service || [];
          var ContentDirectoryService = services.find(function (service) {
            var serviceType = (service.serviceType || [])[0];
            return (serviceType === 'urn:schemas-upnp-org:service:ContentDirectory:1');
          });
          if (!ContentDirectoryService) {
            return;
          }
          server.location += ((ContentDirectoryService.controlURL || [])[0] || '');

          var duplicate = false;
          for (var i = 0; i < self.DLNAServers.length; i++) {
            if (self.DLNAServers[i].UDN === server.UDN) {
              duplicate = true;
              self.DLNAServers[i] = server;
            }
          }
          if (!duplicate) {
            self.DLNAServers.push(server);
          }
        } catch (e) {
          self.logger.error(e);
        }
      });
    }
  });

  try {
    client.search('urn:schemas-upnp-org:device:MediaServer:1');
  } catch (e) {
    self.log('UPNP Search error: ' + e);
  }

  setInterval(() => {
    try {
      client.search('urn:schemas-upnp-org:device:MediaServer:1');
    } catch (e) {
      self.log('UPNP Search error: ' + e);
    	}
  }, 50000);
  this.mpdPlugin = this.commandRouter.pluginManager.getPlugin('music_service', 'mpd');
  // this.startDjmount();
  return libQ.resolve();
};

ControllerUPNPBrowser.prototype.onStop = function () {
  var self = this;

  this.commandRouter.volumioRemoveToBrowseSources('Media Servers');
  client.stop();

  return libQ.resolve();
};

ControllerUPNPBrowser.prototype.discover = function () {
  var defer = libQ.defer();
  var self = this;

  try {
    client.search('urn:schemas-upnp-org:device:MediaServer:1');
  } catch (e) {
    self.log('UPNP Search error: ' + e);
  }

  setTimeout(function () {
    defer.resolve(self.DLNAServers);
  }, 2000);
  return defer.promise;
};

ControllerUPNPBrowser.prototype.handleBrowseUri = function (curUri) {
  var self = this;

  var response;

  if (curUri == 'upnp') { response = self.listRoot(); } else if (curUri.startsWith('upnp/')) {
    var uri = curUri.replace('upnp/', '');
    response = self.listUPNP(uri);
  }

  return response;
};

ControllerUPNPBrowser.prototype.listRoot = function () {
  var self = this;
  var defer = libQ.defer();

  var obj = {
    'navigation': {
      'lists': [
        {
          'availableListViews': ['grid', 'list'],
          'items': [

          ]
        }
      ]
    }
  };

  if (singleBrowse) {
    obj.navigation.prev = {'uri': 'music-library'};
  }
  for (var i = 0; i < this.DLNAServers.length; i++) {
    if (Date.now() - this.DLNAServers[i].lastTimeAlive < 60000) {
      obj.navigation.lists[0].items.push({
        service: 'upnp_browser',
        type: 'streaming-category',
        'title': this.DLNAServers[i].name,
        'uri': 'upnp/' + this.DLNAServers[i].location + '@0', // @ separator, 0 for root element,
        'albumart': this.DLNAServers[i].icon
      });
    } else {
      this.DLNAServers.splice(i, 1);
    }
  }
  defer.resolve(obj);

  return defer.promise;
};

ControllerUPNPBrowser.prototype.listUPNP = function (data) {
  var self = this;

  var defer = libQ.defer();
  var address = data.split('@')[0];
  var info = true;
  var curUri = 'upnp/' + data;
  var albumart = '';
  var title = '';
  if (address.startsWith('folder/')) { address = address.replace('folder/', ''); }
  var id = data.split('@')[1];
  var obj = {
    'navigation': {
      'prev': {
        'uri': 'upnp'
      },
      'lists': [
        {
          'availableListViews': ['grid', 'list'],
          'items': [

          ]
        }
      ]
    }
  };

  browseDLNAServer(id, address, {}, (err, data) => {
    if (err) {
      self.logger.error('Error browsing' + id + ':' + err);
      return defer.reject('');
    }
    if (data.container) {
      for (var i = 0; i < data.container.length; i++) {
        if (data.container[i].title != undefined && data.container[i].title.indexOf('>>') < 0) {
          info = false;
          var type = 'streaming-category';
          albumart = '/albumart?icon=folder-o';
          if (data.container[i].children > 0) {
            type = 'folder';
          }
          var artist = '';
          if (data.container[i].artist) {
                    	artist = data.container[i].artist;
          }
          var title = '';
          if (data.container[i].title) {
                    	title = data.container[i].title;
          }
          var path = address + '@' + data.container[i].id;
          var albumart = self.getAlbumArt({artist: artist, album: title}, path, self.getAlbumartClass(data.container[i].class));

          obj.navigation.lists[0].items.push({
            'service': 'upnp_browser',
            'type': type,
            'title': data.container[i].title,
            'artist': artist,
            'albumart': albumart,
            'album': '',
            'uri': 'upnp/folder/' + address + '@' + data.container[i].id
          });
        }
      }
    }
    if (data.item) {
      obj.navigation.lists[0].availableListViews = ['list'];
      for (var i = 0; i < data.item.length; i++) {
        if (data.item[i].class == 'object.item.audioItem.musicTrack') {
          var item = data.item[i];
          var path = address + '@' + item.id;

          var albumart = self.getAlbumArt({artist: item.artist, album: item.album}, path, 'music');
          if (item.image != undefined && item.image.length > 0) {
            albumart = item.image;
          }
          var track = {
            'service': 'upnp_browser',
            'type': 'song',
            'uri': 'upnp/' + address + '@' + item.id,
            'title': item.title,
            'artist': item.artist,
            'album': item.album,
            'albumart': albumart
          };
          obj.navigation.lists[0].items.push(track);
        }
      }
    }
    browseDLNAServer(id, address, {browseFlag: 'BrowseMetadata'}, (err, data) => {
      if (err) {
        self.logger.error(err);
        return defer.reject('');
      }
      if (data && data.container && data.container[0] && data.container[0].parentId && data.container[0].parentId != '-1') {
        obj.navigation.prev.uri = 'upnp/' + address + '@' + data.container[0].parentId;
        title = data.container[0].title;
        		var artist = '';
        		if (data.container[0].artist) {
            		artist = data.container[0].artist;
        }
        var albumart = self.getAlbumArt({artist: artist, album: title}, path, self.getAlbumartClass(data.container[0].class));
      } else {
        obj.navigation.prev.uri = 'upnp';
      }
      if (info) {
        obj.navigation.info = {
          'uri': curUri,
          'service': 'upnp_browser',
          'type': 'song',
            		'albumart': albumart
        		};
        if (artist && artist.length) {
          obj.navigation.info.album = title;
          obj.navigation.info.artist = artist;
        } else {
          obj.navigation.info.title = title;
        }
    		}
      defer.resolve(obj);
    });
  });

  return defer.promise;
};

ControllerUPNPBrowser.prototype.getAlbumartClass = function (data) {
  var self = this;
  var albumart = '';

  switch (data) {
    case 'object.container.person.musicArtist':
      albumart = 'users';
      break;
    case 'object.container.album.musicAlbum':
      albumart = 'dot-circle-o';
      break;
    case 'object.container.genre.musicGenre':
      albumart = 'none&sourceicon=music_service/mpd/genreicon.png';
      break;
    case 'object.container.playlistContainer':
      albumart = 'none&sourceicon=music_service/mpd/playlisticon.svg';
      break;
    default:
      albumart = 'folder-o';
  }
  return albumart;
};

// ControllerUPNPBrowser.prototype.browseUPNPuri = function (curUri) {
// 	var self = this;
// 	var defer = libQ.defer();
// 	var address = curUri.split("@")[0];
// 	var id = curUri.split("@")[1];
//
// 	browseDLNAServer(id, address, {}, (err, data) => {
// 		var obj = {
// 			"navigation":{
// 				"prev": {
// 					"uri": "dlna:" + address + "@" + id
// 				},
// 				"lists": [
// 					{
// 						"availableListViews": ["list"],
// 						"items": [
//
// 						]
// 					}
// 				]
// 			}
// 		}
// 		data = JSON.parse(data);
// 		for(var i = 0; i < data.container.length; i++){
// 			obj.navigation.lists[0].items.push({
// 				"service": "upnp_browser",
// 				"type": "dlna",
// 				"title": data.container[i].title,
// 				"artist": "",
//         "album": "",
// 				"uri": "dlna:" + address + "@" + data.container[i].id
// 			});
// 		}
// 	});
//
//
//	return defer.promise;
// };

// Define a method to clear, add, and play an array of tracks
ControllerUPNPBrowser.prototype.clearAddPlayTrack = function (track) {
  var self = this;
  self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerUPNPBrowser::clearAddPlayTrack');
  var safeUri = track.uri.replace(/"/g, '\\"');

  return self.mpdPlugin.sendMpdCommand('stop', [])
    .then(function () {
      return self.mpdPlugin.sendMpdCommand('clear', []);
    })
    .then(function () {
      return self.mpdPlugin.sendMpdCommand('load "' + safeUri + '"', []);
    })
    .fail(function (e) {
      return self.mpdPlugin.sendMpdCommand('add "' + safeUri + '"', []);
    })
    .then(function () {
      self.commandRouter.stateMachine.setConsumeUpdateService('mpd', false, false);
      return self.mpdPlugin.sendMpdCommand('play', []);
    });
};

// Spop stop
ControllerUPNPBrowser.prototype.stop = function () {
  var self = this;
  self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerUPNPBrowser::stop');

  return self.mpdPlugin.sendMpdCommand('stop', []);
};

// Spop pause
ControllerUPNPBrowser.prototype.pause = function () {
  var self = this;
  self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerUPNPBrowser::pause');

  // TODO don't send 'toggle' if already paused
  return self.mpdPlugin.sendMpdCommand('pause', []);
};

// Spop resume
ControllerUPNPBrowser.prototype.resume = function () {
  var self = this;
  self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerUPNPBrowser::resume');

  // TODO don't send 'toggle' if already playing
  return self.mpdPlugin.sendMpdCommand('play', []);
};

ControllerUPNPBrowser.prototype.seek = function (position) {
  var self = this;
  this.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'ControllerUPNPBrowser::seek');

  return self.mpdPlugin.seek(position);
};

ControllerUPNPBrowser.prototype.explodeUri = function (uri) {
  var self = this;

  var defer = libQ.defer();
  var entranceUri = uri;
  uri = uri.replace('upnp/', '');// Removing upnp/
  var folder = uri.startsWith('folder/');
  if (folder) {
    uri = uri.replace('folder/');
  }
  var address = uri.split('@')[0];// Getting server address
  var id = uri.split('@')[1];// Getting item ID
  var browseFlag = folder ? 'BrowseDirectChildren' : 'BrowseMetadata';
  browseDLNAServer(id, address, {browseFlag: browseFlag}, (err, data) => {
    if (err) {
      self.logger.error(err);
      return;
    }
    var result = [];
    if (data) {
      if (data.item) {
        for (var i = 0; i < data.item.length; i++) {
          var item = data.item[i];
          if (item.class == 'object.item.audioItem.musicTrack') {
            var albumart = '';
            if (item.image != undefined && item.image.length > 0) {
              albumart = item.image;
            } else {
              albumart = self.getAlbumArt({artist: item.artist, album: item.album}, '');
            }
            var obj = {
              'service': 'upnp_browser',
              'uri': item.source,
              'realUri': entranceUri,
              'type': 'song',
              'albumart': albumart,
              'artist': item.artist,
              'album': item.album,
              'name': item.title,
              'title': item.title,
              'duration': item.duration
            };
            result.push(obj);
          }
        }
      }
      defer.resolve(result);
    }
  });

  return defer.promise;
};

ControllerUPNPBrowser.prototype.search = function (query) {
  var self = this;

  var defer = libQ.defer();
  var list = {
    'title': 'Media Servers',
    'icon': 'fa icon',
    'availableListViews': [
      'grid', 'list'
    ],
    'items': [

    ]
  };
  defer.resolve();

  return defer.promise;
};

ControllerUPNPBrowser.prototype.parseTrack = function (uri) {
  var self = this;
  var defer = libQ.defer();

  var readableStream = fs.createReadStream(uri);
  mm.parseStream(readableStream).then(function (metadata) {
    var common = metadata.common;
    var item = {
      service: 'upnp_browser',
      type: 'song',
      title: common.title,
      name: common.title,
      artist: common.artist,
      album: common.album,
      		// Maybe use the album-art embedded in the metadata.common.picture?
      albumart: self.getAlbumArt({artist: common.artist, album: common.album}, '/' + uri.substring(0, uri.lastIndexOf('/')).replace('/mnt', '')),
      uri: uri
    };
    readableStream.close();
    defer.resolve(item);
  }).catch(function (err) {
    	self.logger.error(err.message);
    	defer.reject(err.message);
  });

  return defer.promise;
};

ControllerUPNPBrowser.prototype.getContent = function (content) {
  var self = this;
  var promises = [];
  var defer = libQ.defer();

  for (var i = 0; i < content.length; i++) {
    if (content[i].IsDirectory) {
      var item = {
        service: 'upnp_browser',
        type: 'streaming-category',
        title: content[i].Name,
        icon: 'fa fa-folder-open-o',
        uri: 'upnp/' + content[i].Path
      };

      promises.push(item);
    } else {
      var upnppath = content[i].Path;
      var metas = self.parseTrack(upnppath);
      promises.push(metas);
    }
  }
  libQ.all(promises)
    .then(function (result) {
      defer.resolve(result);
    })
    .fail(function (err) {
      self.logger.error('Cannot get content ' + err);
      defer.reject(new Error());
    });

  return defer.promise;
};

ControllerUPNPBrowser.prototype.getAlbumArt = function (data, path, icon) {
  if (this.albumArtPlugin == undefined) {
    // initialization, skipped from second call
    this.albumArtPlugin = this.commandRouter.pluginManager.getPlugin('miscellanea', 'albumart');
  }

  if (this.albumArtPlugin) { return this.albumArtPlugin.getAlbumArt(data, path, icon); } else {
    return '/albumart';
  }
};

function xmlToJson (url, callback) {
  unirest.get(url)
    .timeout(3000)
    .end(function (response) {
        	if (response.status === 200) {
        var parser = new xml2js.Parser();
        parser.parseString(response.body, function (err, result) {
          callback(null, result);
        });
      } else {
        callback('error', null);
      }
    });
}

ControllerUPNPBrowser.prototype.log = function (message) {
  if (debug) {
    console.log(message);
  }
};

ControllerUPNPBrowser.prototype.prefetch = function (trackBlock) {
  var self = this;
  this.logger.info('Doing Prefetch in UPNP');
  var uri = trackBlock.uri;

  var safeUri = uri.replace(/"/g, '\\"');
  return self.mpdPlugin.sendMpdCommand('add "' + safeUri + '"', [])
    	.then(function () {
        	return self.mpdPlugin.sendMpdCommand('consume 1', []);
    	});
};
