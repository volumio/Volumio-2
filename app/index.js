'use strict';

var libQ = require('kew');
var libFast = require('fast.js');
var fs = require('fs-extra');
var exec = require('child_process').exec;
var winston = require('winston');
var vconf = require('v-conf');
var events = require('./volumioEvents');

// Define the CoreCommandRouter class
module.exports = CoreCommandRouter;
function CoreCommandRouter(server) {

	fs.ensureFileSync('/var/log/volumio.log');
	this.logger = new (winston.Logger)({
		transports: [
			new (winston.transports.Console)(),
			new (winston.transports.File)({
				filename: '/var/log/volumio.log',
				json: false
			})
		]
	});

	this.eventListeners = [];
	this.sharedVars = new vconf();

	this.logger.info("-------------------------------------------");
	this.logger.info("-----            Volumio2              ----");
	this.logger.info("-------------------------------------------");
	this.logger.info("-----          System startup          ----");
	this.logger.info("-------------------------------------------");

	// Start the music library
	this.musicLibrary = new (require('./musiclibrary.js'))(this);

	// Start plugins
	this.pluginManager = new (require(__dirname + '/pluginmanager.js'))(this, server);
	this.pluginManager.loadPlugins();
	//self.pluginManager.onVolumioStart();
	//self.pluginManager.startPlugins();

	// Start the state machine
	this.stateMachine = new (require('./statemachine.js'))(this);


	// Start the volume controller
	this.volumeControl = new (require('./volumecontrol.js'))(this);

	// Start the playListManager.playPlaylistlist FS
	//self.playlistFS = new (require('./playlistfs.js'))(self);

	this.playListManager = new (require('./playlistManager.js'))(this);

	this.platformspecific = new (require(__dirname + '/platformSpecific.js'))(this);

	this.pushConsoleMessage('BOOT COMPLETED');

	//Startup Sound
	var self = this;
	exec("/usr/bin/aplay --device=plughw:0,0 /volumio/app/startup.wav", function (error, stdout, stderr) {
		if (error !== null) {
			self.pushConsoleMessage(error);
		}
	});

}

CoreCommandRouter.prototype.changeOutputDevice = function (device) {
	this.pushConsoleMessage('CoreCommandRouter::changeOutputDevice');
	this.sharedVars.set('alsa.outputdevice', device);
	this.fireEvent(events.OUTPUT_DEVICE_CHANGED);
};

// Methods usually called by the Client Interfaces ----------------------------------------------------------------------------

// Volumio Play
CoreCommandRouter.prototype.volumioPlay = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioPlay');
	return this.stateMachine.play();
};

// Volumio Pause
CoreCommandRouter.prototype.volumioPause = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioPause');
	return this.stateMachine.pause();
};

// Volumio Stop
CoreCommandRouter.prototype.volumioStop = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioStop');
	return this.stateMachine.stop();
};

// Volumio Previous
CoreCommandRouter.prototype.volumioPrevious = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioPrevious');
	return this.stateMachine.previous();
};

// Volumio Next
CoreCommandRouter.prototype.volumioNext = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioNext');
	return this.stateMachine.next();
};

// Volumio Get State
CoreCommandRouter.prototype.volumioGetState = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioGetState');
	return this.stateMachine.getState();
};

// Volumio Get Queue
CoreCommandRouter.prototype.volumioGetQueue = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioGetQueue');
	return this.stateMachine.getQueue();
};

// Volumio Remove Queue Item
CoreCommandRouter.prototype.volumioRemoveQueueItem = function (nIndex) {
	this.pushConsoleMessage('CoreCommandRouter::volumioRemoveQueueItem');
	return this.stateMachine.removeQueueItem(nIndex);
};

// Volumio Clear Queue Item
CoreCommandRouter.prototype.volumioClearQueue = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioClearQueue');
	return this.stateMachine.clearQueue();
};

// Volumio Set Volume
CoreCommandRouter.prototype.volumiosetvolume = function (VolumeInteger) {
	this.fireEvent(events.SET_VOLUME, VolumeInteger);
	return this.volumeControl.alsavolume(VolumeInteger);
};

// Volumio Update Volume
CoreCommandRouter.prototype.volumioupdatevolume = function (vol) {
	this.fireEvent(events.UPDATE_VOLUME, vol);
	return this.stateMachine.updateVolume(vol);
};

// Volumio Retrieve Volume
CoreCommandRouter.prototype.volumioretrievevolume = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioRetrievevolume');
	return this.volumeControl.retrievevolume();
};

CoreCommandRouter.prototype.addEventListener = function (event, listener) {
	var type = event.type;
	if (!type) {
		throw new Error("Event must have a type");
	}
	if (this.eventListeners[type] == undefined) {
		this.eventListeners[type] = [];
	}
	this.eventListeners[type].push(listener);
};

CoreCommandRouter.prototype.fireEvent = function (event, data) {
	var type = event.type;
	if (!type) {
		throw new Error("Event must have a type");
	}
	var listeners = this.eventListeners[type];
	if (listeners != undefined) {
		var nListeners = listeners.length;
		for (var i = 0; i < nListeners; i++) {
			var func = this.eventListeners[type][i];
			try {
				func(data);
			} catch (e) {
				this.logger.error("Help! Some event listeners for " + type + " are crashing!");
				this.logger.error(e);
			}
		}
	} else {
		this.logger.debug("No events listeners for " + type);
	}
};

// Volumio Add Queue Uids
CoreCommandRouter.prototype.volumioAddQueueUids = function (arrayUids) {
	this.pushConsoleMessage('CoreCommandRouter::volumioAddQueueUids');
	return this.musicLibrary.addQueueUids(arrayUids);
};
/*

 TODO: This should become the default entry point for adding music to any service
 // Volumio Add Queue Uri
 CoreCommandRouter.prototype.volumioAddQueueUri = function(data) {
 var self = this;
 self.pushConsoleMessage( 'CoreCommandRouter::volumioAddQueueUri');
 var service = data.service;
 var uri = data.uri;
 return self.executeOnPlugin('music_service', 'mpd', 'add', uri);
 }
 */
// Volumio Rebuild Library
CoreCommandRouter.prototype.volumioRebuildLibrary = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioRebuildLibrary');
	return this.musicLibrary.buildLibrary();
};

// Volumio Get Library Index
CoreCommandRouter.prototype.volumioGetLibraryFilters = function (sUid) {
	this.pushConsoleMessage('CoreCommandRouter::volumioGetLibraryFilters');
	return this.musicLibrary.getIndex(sUid);
};

// Volumio Browse Library
CoreCommandRouter.prototype.volumioGetLibraryListing = function (sUid, objOptions) {
	this.pushConsoleMessage('CoreCommandRouter::volumioGetLibraryListing');
	return this.musicLibrary.getListing(sUid, objOptions);
};

// Volumio Browse Sources
CoreCommandRouter.prototype.volumioGetBrowseSources = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioGetBrowseSources');
	return this.musicLibrary.getBrowseSources();
};

CoreCommandRouter.prototype.volumioAddToBrowseSources = function (data) {
	this.pushConsoleMessage('CoreCommandRouter::volumioAddToBrowseSources' + data);
	return this.musicLibrary.addToBrowseSources(data);
};

// Volumio Get Playlist Index
CoreCommandRouter.prototype.volumioGetPlaylistIndex = function (sUid) {
	this.pushConsoleMessage('CoreCommandRouter::volumioGetPlaylistIndex');
	return this.playlistFS.getIndex(sUid);
};

// Service Update Tracklist
CoreCommandRouter.prototype.serviceUpdateTracklist = function (sService) {
	this.pushConsoleMessage('CoreCommandRouter::serviceUpdateTracklist');
	var thisPlugin = this.pluginManager.getPlugin('music_service', sService);
	return thisPlugin.rebuildTracklist();
};

// Start WirelessScan
CoreCommandRouter.prototype.volumiowirelessscan = function () {
	this.pushConsoleMessage('CoreCommandRouter::StartWirelessScan');
	var thisPlugin = this.pluginManager.getPlugin('music_service', sService);
	return thisPlugin.scanWirelessNetworks();
};

// Push WirelessScan Results (TODO SEND VIA WS)
CoreCommandRouter.prototype.volumiopushwirelessnetworks = function (results) {
	this.pushConsoleMessage(results);
};

// Volumio Import Playlists
CoreCommandRouter.prototype.volumioImportServicePlaylists = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioImportServicePlaylists');
	return this.playlistFS.importServicePlaylists();
};

// Methods usually called by the State Machine --------------------------------------------------------------------

CoreCommandRouter.prototype.volumioPushState = function (state) {
	this.pushConsoleMessage('CoreCommandRouter::volumioPushState');
	this.executeOnPlugin('system_controller', 'volumiodiscovery', 'saveDeviceInfo', state);
	// Announce new player state to each client interface
	var self = this;
	var res = libQ.all(
		libFast.map(this.pluginManager.getPluginNames('user_interface'), function (sInterface) {
			var thisInterface = self.pluginManager.getPlugin('user_interface', sInterface);
			return thisInterface.pushState(state);
		})
	);
	self.fireEvent(events.PUSH_STATE, state);
	return res;
};

CoreCommandRouter.prototype.volumioResetState = function () {
	this.pushConsoleMessage('CoreCommandRouter::volumioResetState');
	return this.stateMachine.resetVolumioState();
};

CoreCommandRouter.prototype.volumioPushQueue = function (queue) {
	this.pushConsoleMessage('CoreCommandRouter::volumioPushQueue');

	// Announce new player queue to each client interface
	var self = this;
	return libQ.all(
		libFast.map(this.pluginManager.getPluginNames('user_interface'), function (sInterface) {
			var thisInterface = self.pluginManager.getPlugin('user_interface', sInterface);
			return thisInterface.pushQueue(queue);
		})
	);
};

// MPD Clear-Add-Play
CoreCommandRouter.prototype.serviceClearAddPlayTracks = function (arrayTrackIds, sService) {
	this.pushConsoleMessage('CoreCommandRouter::serviceClearAddPlayTracks');
	var thisPlugin = this.pluginManager.getPlugin('music_service', sService);
	return thisPlugin.clearAddPlayTracks(arrayTrackIds);
};

// MPD Stop
CoreCommandRouter.prototype.serviceStop = function (sService) {
	this.pushConsoleMessage('CoreCommandRouter::serviceStop');
	var thisPlugin = this.pluginManager.getPlugin('music_service', sService);
	return thisPlugin.stop();
};

// MPD Pause
CoreCommandRouter.prototype.servicePause = function (sService) {
	this.pushConsoleMessage('CoreCommandRouter::servicePause');
	var thisPlugin = this.pluginManager.getPlugin('music_service', sService);
	return thisPlugin.pause();
};

// MPD Resume
CoreCommandRouter.prototype.serviceResume = function (sService) {
	this.pushConsoleMessage('CoreCommandRouter::serviceResume');
	var thisPlugin = this.pluginManager.getPlugin('music_service', sService);
	return thisPlugin.resume();
};

// Methods usually called by the service controllers --------------------------------------------------------------

CoreCommandRouter.prototype.servicePushState = function (state, sService) {
	this.pushConsoleMessage('CoreCommandRouter::servicePushState');
	return this.stateMachine.syncState(state, sService);
};

// Methods usually called by the music library ---------------------------------------------------------------------

// Get tracklists from all services and return them as an array
CoreCommandRouter.prototype.getAllTracklists = function () {
	this.pushConsoleMessage('CoreCommandRouter::getAllTracklists');

	// This is the synchronous way to get libraries, which waits for each controller to return its tracklist before continuing
	var self = this;
	return libQ.all(
		libFast.map(this.pluginManager.getPluginNames('music_service'), function (sService) {
			var thisService = self.pluginManager.getPlugin('music_service', sService);
			return thisService.getTracklist();
		})
	);
};

// Volumio Add Queue Items
CoreCommandRouter.prototype.addQueueItems = function (arrayItems) {
	this.pushConsoleMessage('CoreCommandRouter::volumioAddQueueItems');
	return this.stateMachine.addQueueItems(arrayItems);
};

// Volumio Check Favourites
CoreCommandRouter.prototype.checkFavourites = function (data) {
	var self = this;
	//self.pushConsoleMessage('CoreCommandRouter::volumioAddQueueItems');

	return self.stateMachine.checkFavourites(data);
};

// Volumio Emit Favourites
CoreCommandRouter.prototype.emitFavourites = function (msg) {
	var plugin = this.pluginManager.getPlugin('user_interface', 'websocket');
	plugin.emitFavourites(msg);
};

// Volumio Play Playlist
CoreCommandRouter.prototype.playPlaylist = function (data) {
	var self = this;
	return self.playListManager.playPlaylist(data);
};

// Utility functions ---------------------------------------------------------------------------------------------

CoreCommandRouter.prototype.executeOnPlugin = function (type, name, method, data) {
	this.pushConsoleMessage('CoreCommandRouter::executeOnPlugin: ' + name + ' , ' + method);

	var thisPlugin = this.pluginManager.getPlugin(type, name);

	if (thisPlugin != undefined)
		if (thisPlugin[method]) {
			return thisPlugin[method](data);
		} else {
			this.pushConsoleMessage('Error : CoreCommandRouter::executeOnPlugin: No method [' + method + '] in plugin ' + name);
		}
	else return undefined;
};

CoreCommandRouter.prototype.getUIConfigOnPlugin = function (type, name, data) {
	this.pushConsoleMessage('CoreCommandRouter::getUIConfigOnPlugin');
	var thisPlugin = this.pluginManager.getPlugin(type, name);
	return thisPlugin.getUIConfig(data);
};

/* what is this?
 CoreCommandRouter.prototype.getConfiguration=function(componentCode)
 {
 console.log("_________ "+componentCode);
 }
 */

CoreCommandRouter.prototype.pushConsoleMessage = function (sMessage) {
	this.logger.info(sMessage);
	/*
	 var self = this;
	 return libQ.all(
	 libFast.map(self.pluginManager.getPluginNames.call(self.pluginManager, 'user_interface'), function(sInterface) {
	 var thisInterface = self.pluginManager.getPlugin.call(self.pluginManager, 'user_interface', sInterface);
	 if( typeof thisInterface.printConsoleMessage === "function")
	 return thisInterface.printConsoleMessage.call(thisInterface, sMessage);
	 })
	 );
	 */
};

CoreCommandRouter.prototype.pushToastMessage = function (type, title, message) {
	var self = this;
	return libQ.all(
		libFast.map(this.pluginManager.getPluginNames('user_interface'), function (sInterface) {
			var thisInterface = self.pluginManager.getPlugin('user_interface', sInterface);
			if (typeof thisInterface.printToastMessage === "function")
				return thisInterface.printToastMessage(type, title, message);
		})
	);
};

CoreCommandRouter.prototype.broadcastToastMessage = function (type, title, message) {
	var self = this;
	return libQ.all(
		libFast.map(this.pluginManager.getPluginNames('user_interface'), function (sInterface) {
			var thisInterface = self.pluginManager.getPlugin('user_interface', sInterface);
			if (typeof thisInterface.broadcastToastMessage === "function")
				return thisInterface.broadcastToastMessage(type, title, message);
		})
	);
};

CoreCommandRouter.prototype.pushMultiroomDevices = function (data) {
	var self = this;
	return libQ.all(
		libFast.map(this.pluginManager.getPluginNames('user_interface'), function (sInterface) {
			var thisInterface = self.pluginManager.getPlugin('user_interface', sInterface);
			if (typeof thisInterface.pushMultiroomDevices === "function")
				return thisInterface.pushMultiroomDevices(data);
		})
	);
};

CoreCommandRouter.prototype.pushMultiroom = function (data) {
	var self = this;
	return libQ.all(
		libFast.map(this.pluginManager.getPluginNames('user_interface'), function (sInterface) {
			var thisInterface = self.pluginManager.getPlugin('user_interface', sInterface);
			if (typeof thisInterface.pushMultiroom === "function")
				return thisInterface.pushMultiroom(data);
		})
	);
};


CoreCommandRouter.prototype.pushAirplay = function (data) {
	var self = this;
	return libQ.all(
		libFast.map(this.pluginManager.getPluginNames('user_interface'), function (sInterface) {
			var thisInterface = self.pluginManager.getPlugin('user_interface', sInterface);
			if (typeof thisInterface.pushAirplay === "function")
				return thisInterface.pushAirplay(data);
		})
	);
};


// Platform specific & Hardware related options, they can be found in platformSpecific.js
// This allows to change system commands across different devices\environments
CoreCommandRouter.prototype.shutdown = function () {
	this.platformspecific.shutdown();
};

CoreCommandRouter.prototype.reboot = function () {
	this.platformspecific.reboot();
};

CoreCommandRouter.prototype.networRestart = function () {
	this.platformspecific.networkRestart();
};


