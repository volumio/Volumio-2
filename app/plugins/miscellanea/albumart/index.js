'use strict';

var exec = require('child_process').exec;
var fork = require('child_process').fork;
var libQ = require('kew');
var enableweb = true;
var defaultwebsize = 'large';
var cacheid = '';
var metadataimage = false;

// Define the AlbumArt class
module.exports = AlbumArt;

function AlbumArt (context) {
  var self = this;

  // Save a reference to the parent commandRouter
  self.context = context;
  self.commandRouter = self.context.coreCommand;
  self.configManager = self.context.configManager;
}

AlbumArt.prototype.onVolumioStart = function () {
  var self = this;

  var configFile = self.commandRouter.pluginManager.getConfigurationFile(self.context, 'config.json');

  self.config = new (require('v-conf'))();
  self.config.loadFile(configFile);
  self.startAlbumartServer();

  return libQ.resolve();
};

AlbumArt.prototype.startAlbumartServer = function () {
  var self = this;

  enableweb = self.config.get('enableweb', true);
  defaultwebsize = self.config.get('defaultwebsize', 'extralarge');
  cacheid = self.config.get('cacheid', 0);
  if (cacheid === 0) {
    cacheid = Math.floor(Math.random() * 1000);
    self.config.set('cacheid', cacheid);
  }
  metadataimage = self.config.get('metadataimage', false);

  // Starting server
  var albumartServerCmdArray = [self.config.get('port'), self.config.get('folder')];
  var albumartServer = fork(__dirname + '/serverStartup.js', albumartServerCmdArray);

  albumartServer.on('error', function (error) {
    console.log('Albumart Server Error: ' + error);
  });

  albumartServer.on('close', function (error) {
    console.log('Albumart Server FATAL ERROR: ' + error);
    setTimeout(() => {
        	self.startAlbumartServer();
    }, 5000);
  });
};

AlbumArt.prototype.onStop = function () {
  var self = this;
  // Perform startup tasks here
};

AlbumArt.prototype.onRestart = function () {
  var self = this;
  // Perform startup tasks here
};

AlbumArt.prototype.onInstall = function () {
  var self = this;
  // Perform your installation tasks here
};

AlbumArt.prototype.onUninstall = function () {
  var self = this;
  // Perform your installation tasks here
};

AlbumArt.prototype.getConfigurationFiles = function () {
  var self = this;

  return ['config.json'];
};

/**
 * This method builds the url to the albumart server
 * @param data object with fields:  artist, album, size
 * @param path path to album art folder to scan
 * @param icon icon to show
 * @returns {string}
 */
AlbumArt.prototype.getAlbumArt = function (data, path, icon) {
  var artist, album, size;

  if (data != undefined && data.path != undefined) {
    path = this.sanitizeUri(data.path);
  }

  var web;
  try {
    if (data != undefined && data.artist != undefined && enableweb) {
      // performing decode since we cannot assume client will pass decoded strings

      artist = decodeURIComponent(data.artist);

      if (data.album) {
        album = decodeURIComponent(data.album);
      } else {
        album = '';
      }

      if (data.size) {
        size = data.size;
      } else {
        size = defaultwebsize;
      }

      web = '&web=' + encodeURIComponent(artist) + '/' + encodeURIComponent(album) + '/' + size;
    }
  } catch (e) {
    console.log('Cannot compose Albumart path');
  }
  var url = '/albumart';
  url = url + '?cacheid=' + cacheid;

  if (web != undefined) {
    url = url + web;
  }

  if (path != undefined) {
    url = url + '&path=' + encodeURIComponent(path);
  }

  if (icon !== undefined) {
    url = url + '&icon=' + icon;
  }

  if (path != undefined) {
    url = url + '&metadata=' + metadataimage;
  }

  return url;
};

AlbumArt.prototype.getConfigParam = function (key) {
  var self = this;
  return self.config.get(key);
};

AlbumArt.prototype.setConfigParam = function (data) {
  var self = this;

  self.config.set(data.key, data.value);
};

AlbumArt.prototype.saveAlbumartOptions = function (data) {
  var self = this;

  if (data.enable_web != undefined) {
    self.config.set('enableweb', data['enable_web']);
    enableweb = data.enable_web;
  }

  if (data.web_quality != undefined) {
    self.config.set('defaultwebsize', data['web_quality'].value);
    defaultwebsize = data.web_quality.value;
  }

  if (data.metadataimage != undefined) {
    self.config.set('metadataimage', data['metadataimage']);
    metadataimage = data.metadataimage;
  }

  self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('APPEARANCE.ALBUMART_SETTINGS'), self.commandRouter.getI18nString('COMMON.SETTINGS_SAVED_SUCCESSFULLY'));
};

AlbumArt.prototype.clearAlbumartCache = function () {
  var self = this;

  exec('/bin/rm -rf /data/albumart/folder/* /data/albumart/metadata/* /data/albumart/web/*', {uid: 1000, gid: 1000}, function (error, stdout, stderr) {
    if (error) {
      console.log('Cannot Delete Albumart Cache DirectoryB: ' + error);
      self.commandRouter.pushToastMessage('error', self.commandRouter.getI18nString('APPEARANCE.ALBUMART_SETTINGS'), self.commandRouter.getI18nString('APPEARANCE.ALBUMART_CACHE_CLEAR_ERROR'));
    } else {
      cacheid++;
      self.config.set('cacheid', cacheid);
      self.commandRouter.executeOnPlugin('music_service', 'mpd', 'rebuildAlbumCache');
      self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('APPEARANCE.ALBUMART_SETTINGS'), self.commandRouter.getI18nString('APPEARANCE.ALBUMART_CACHE_CLEARED'));
    }
  });
};
