'use strict';

var libQ = require('kew');
var fs = require('fs-extra');

/** Define the InterfaceWebUI class (Used by DEV UI)
 *
 * @type {InterfaceWebUI}
 */
module.exports = InterfaceWebUI;
function InterfaceWebUI(context) {
	var self = this;

	self.context = context;
	self.commandRouter = self.context.coreCommand;
    self.musicLibrary=self.commandRouter.musicLibrary;

	self.logger = self.commandRouter.logger;

	/** Init SocketIO listener */
	self.libSocketIO = require('socket.io')(self.context.websocketServer);

	/** On Client Connection, listen for various types of clients requests */
	self.libSocketIO.on('connection', function (connWebSocket) {

            connWebSocket.on('getDeviceInfo', function () {
                var uuid=self.commandRouter.sharedVars.get('system.uuid');
                var name=self.commandRouter.sharedVars.get('system.name');

                var data={
                    "uuid":uuid,
                    "name":name
                };
                connWebSocket.emit('pushDeviceInfo', data);

            });

			connWebSocket.on('getState', function () {
				var selfConnWebSocket = this;

				var state = self.commandRouter.volumioGetState();
				return self.pushState(state, selfConnWebSocket);

			});

			connWebSocket.on('getQueue', function () {
				var selfConnWebSocket = this;

				var queue = self.commandRouter.volumioGetQueue();
				return self.pushQueue(queue, selfConnWebSocket)
			});

			connWebSocket.on('removeQueueItem', function (nIndex) {

				return self.commandRouter.volumioRemoveQueueItem.call(self.commandRouter, nIndex);

			});

			connWebSocket.on('addQueueUids', function (arrayUids) {

                return self.commandRouter.volumioAddQueueUids.call(self.commandRouter, arrayUids);
			});

			connWebSocket.on('addToQueue', function (data) {

                 self.commandRouter.addQueueItems(data)
                .then(function(){
                    var item = data.uri;
                    if (data.title) {
                        item = data.title;
                    }
					self.printToastMessage('success', self.commandRouter.getI18nString('COMMON.ADD_QUEUE_TITLE'),  item);
                });
			});

			connWebSocket.on('replaceAndPlay', function (data) {

				self.commandRouter.replaceAndPlay(data)
				.then(function(e){
					return self.commandRouter.volumioPlay(e.firstItemIndex);
				});
			});

            connWebSocket.on('replaceAndPlayCue', function (data) {
                var timeStart = Date.now();

                if (data.service == undefined || data.service == 'mpd') {
                    var uri = data.uri;
                    var arr = uri.split("/");
                    arr.shift();
                    var str = arr.join('/');
                }
                else str = data.uri;

                self.logStart('Client requests Volumio Clear Queue')
                    .then(self.commandRouter.volumioClearQueue.bind(self.commandRouter))
					.then(function () {
						self.commandRouter.executeOnPlugin('music_service', 'mpd', 'addPlayCue', {
                        'uri': str,
                        'number': data.number
                    });
                })
                    .fail(self.pushError.bind(self))
                    .done(function () {
                        return self.logDone(timeStart);
                    });

            });

			connWebSocket.on('addPlay', function (data) {

                self.commandRouter.addQueueItems(data)
                    .then(function(e){
                        return self.commandRouter.volumioPlay(e.firstItemIndex);
                    });
			});

			connWebSocket.on('addPlayCue', function (data) {
				if (data.service == undefined || data.service == 'mpd') {
					var uri = data.uri;
					var arr = uri.split("/");
					arr.shift();
					var str = arr.join('/');
				}
				else str = data.uri;

				//TODO add proper service handler
				var timeStart = Date.now();
				self.logStart('Client requests add and Play Volumio CUE entry')
					.then(function () {
						return self.commandRouter.executeOnPlugin('music_service', 'mpd', 'addPlayCue', {
							'uri': str,
							'number': data.number
						});
					})
					.fail(self.pushError.bind(self))
					.done(function () {
						return self.commandRouter.pushToastMessage('success', self.commandRouter.getI18nString('COMMON.PLAY'), str);
					});
			});

			connWebSocket.on('removeFromQueue', function (positionN) {
				//TODO add proper service handler

				var position = positionN.value;
                return self.commandRouter.volumioRemoveQueueItem(positionN);
			});

			connWebSocket.on('seek', function (position) {

				return self.commandRouter.volumioSeek(position);
			});

			connWebSocket.on('getLibraryListing', function (objParams) {
				var selfConnWebSocket = this;

				var timeStart = Date.now();
				self.logStart('Client requests get library listing')
					.then(function () {
						return self.commandRouter.volumioGetLibraryListing.call(self.commandRouter, objParams.uid, objParams.options);
					})
					.then(function (objBrowseData) {
						if (objBrowseData) {
							return self.pushLibraryListing.call(self, objBrowseData, selfConnWebSocket);
						}
					})
					.fail(self.pushError.bind(self))
					.done(function () {
						return self.logDone(timeStart);
					});
			});

			connWebSocket.on('getLibraryFilters', function (sUid) {
				var selfConnWebSocket = this;

				var timeStart = Date.now();
				self.logStart('Client requests get library index')
					.then(function () {
						return self.commandRouter.volumioGetLibraryFilters.call(self.commandRouter, sUid);
					})
					.then(function (objBrowseData) {
						if (objBrowseData) {
							return self.pushLibraryFilters.call(self, objBrowseData, selfConnWebSocket);
						}
					})
					.fail(self.pushError.bind(self))
					.done(function () {
						return self.logDone(timeStart);
					});
			});

			connWebSocket.on('getPlaylistIndex', function (sUid) {
				var selfConnWebSocket = this;

				var timeStart = Date.now();
				self.logStart('Client requests get playlist index')
					.then(function () {
						return self.commandRouter.volumioGetPlaylistIndex.call(self.commandRouter, sUid);
					})
					.then(function (objBrowseData) {
						if (objBrowseData) {
							return self.pushPlaylistIndex.call(self, objBrowseData, selfConnWebSocket);
						}
					})
					.fail(self.pushError.bind(self))
					.done(function () {
						return self.logDone(timeStart);
					});
			});

			connWebSocket.on('play', function (N) {

				if (N == null) {
					return self.commandRouter.volumioPlay();
				} else if (N.value != undefined) {
                   return self.commandRouter.volumioPlay(N.value);
				}
			});

			connWebSocket.on('pause', function () {

				return self.commandRouter.volumioPause();
			});

            connWebSocket.on('toggle', function () {
                return self.commandRouter.volumioToggle()
            });

			connWebSocket.on('stop', function () {
				return self.commandRouter.volumioStop()
			});

			connWebSocket.on('clearQueue', function () {
				return self.commandRouter.volumioClearQueue()
			});

			connWebSocket.on('prev', function () {
				return self.commandRouter.volumioPrevious()
			});

			connWebSocket.on('next', function () {
                self.commandRouter.volumioNext()
			});

			connWebSocket.on('setRandom', function (data) {
				//TODO add proper service handler
                return self.commandRouter.volumioRandom(data.value);
			});

			connWebSocket.on('setRepeat', function (data) {
				//TODO add proper service handler
                return self.commandRouter.volumioRepeat(data.value,data.repeatSingle);
			});

			connWebSocket.on('serviceUpdateTracklist', function (sService) {
				return self.commandRouter.serviceUpdateTracklist(sService);
			});

			connWebSocket.on('rebuildLibrary', function () {
                return self.commandRouter.volumioRebuildLibrary();
			});

			connWebSocket.on('updateAllMetadata', function () {
                return self.commandRouter.updateAllMetadata();
			});

			connWebSocket.on('volume', function (VolumeInteger) {
				return self.commandRouter.volumiosetvolume(VolumeInteger);
			});

			connWebSocket.on('mute', function () {

                return self.commandRouter.volumiosetvolume('mute');
			});

			connWebSocket.on('unmute', function () {

                return self.commandRouter.volumiosetvolume('unmute');
			});

			connWebSocket.on('importServicePlaylists', function () {
				//TODO CONSIDER REMOVING
                self.commandRouter.volumioImportServicePlaylists();
			});

			connWebSocket.on('getMenuItems', function () {
                var lang_code = self.commandRouter.sharedVars.get('language_code');

                var defer=libQ.defer();
                self.commandRouter.i18nJson(__dirname+'/../../../i18n/strings_'+lang_code+'.json',
                    __dirname+'/../../../i18n/strings_en.json',
                    __dirname + '/../../../mainmenu.json')
                    .then(function(menuitems)
                    {
                        //console.log(JSON.stringify(menuitems['menuItems']));
                        return self.libSocketIO.emit('pushMenuItems', menuitems['menuItems']);
					});
            });

			connWebSocket.on('callMethod', function (dataJson) {
				var promise;

				var category = dataJson.endpoint.substring(0, dataJson.endpoint.indexOf('/'));
				var name = dataJson.endpoint.substring(dataJson.endpoint.indexOf('/') + 1);

                self.logger.info("CALLMETHOD: "+category+" "+name+" "+dataJson.method+" "+dataJson.data);
				var promise = self.commandRouter.executeOnPlugin(category, name, dataJson.method, dataJson.data);
				if (promise != undefined) {
							connWebSocket.emit(promise.message, promise.payload);
				} else {
				}
			});

			connWebSocket.on('getUiConfig', function (data) {
				var selfConnWebSocket = this;

				var splitted = data.page.split('/');
				var response;

				if (splitted.length == 2) {
					response = self.commandRouter.getUIConfigOnPlugin(splitted[0], splitted[1], {});
					response.then(function(config)
					{
						selfConnWebSocket.emit('pushUiConfig', config);
					});
				} else if (splitted.length == 3) {
					selfConnWebSocket.emit('pushUiConfig', {"page": {"label": ""},"sections": [{"coreSection":splitted[2]}]});
				} else {
					response = self.commandRouter.getUIConfigOnPlugin('system_controller', splitted[0], {});
					response.then(function(config)
					{
						selfConnWebSocket.emit('pushUiConfig', config);
					});
				}




			});

			connWebSocket.on('getMultiRoomDevices', function (data) {
				var selfConnWebSocket = this;

				self.pushMultiroom(selfConnWebSocket);
			});

			connWebSocket.on('getBrowseSources', function (date) {
				var selfConnWebSocket = this;
				var response;

				response = self.commandRouter.volumioGetBrowseSources();

				selfConnWebSocket.emit('pushBrowseSources', response);
			});

			connWebSocket.on('browseLibrary', function (data) {
				var selfConnWebSocket = this;

				var curUri = data.uri;

				var response;

				response=self.musicLibrary.executeBrowseSource(curUri);

				if (response != undefined) {
					response.then(function (result) {
							selfConnWebSocket.emit('pushBrowseLibrary', result);
						})
						.fail(function () {
							self.printToastMessage('error', "Browse error", 'An error occurred while browsing the folder.');
						});
				}

			});

			// TO DO: ADD TRANSLATIONS !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
			connWebSocket.on('manageBackup', function (data) {
				var selfConnWebSocket = this;

				var value = data;

				var response;

				response=self.commandRouter.managePlaylists(value)
					.then(self.commandRouter.manageFavourites(value))
					.fail(function () {
						self.printToastMessage('error', "Backup error", 'An error occurred while managing backups');
					});
			});

			connWebSocket.on('getBackup', function (data) {
				var selfConnWebSocket = this;

				var response = self.commandRouter.loadBackup(data);

				if (response != undefined) {
					response.then(function (result) {
						selfConnWebSocket.emit('pushBackup', result);
					})
						.fail(function () {
							self.printToastMessage('error', "Browse error", 'An error occurred while browsing the folder.');
						});
				}

			});

			connWebSocket.on('restoreConfig', function (data) {
				var selfConnWebSocket = this;

				var response = self.commandRouter.restorePluginsConf()
					.then(self.commandRouter.restorePluginsConf())
					.fail(function () {
							self.printToastMessage('error', "Browse error", 'An error occurred while browsing the folder.');
						});
			});

			connWebSocket.on('search', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.musicLibrary.search(data);
				returnedData.then(function (result) {
					selfConnWebSocket.emit('pushBrowseLibrary', result);
				});
			});

			connWebSocket.on('goTo', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.musicLibrary.goto(data);
				returnedData.then(function (result) {
					selfConnWebSocket.emit('pushBrowseLibrary', result);
				});
			});


			connWebSocket.on('GetTrackInfo', function (data) {
				var selfConnWebSocket = this;
				selfConnWebSocket.emit('pushGetTrackInfo', data);
			});

			//add my web radio
			connWebSocket.on('addWebRadio', function (data) {
				var selfConnWebSocket = this;

				var response;

				response = self.commandRouter.executeOnPlugin('music_service', 'webradio', 'addMyWebRadio', data);

				if (response != undefined) {
					response.then(function (result) {
							selfConnWebSocket.emit('pushAddWebRadio', result);
						})
						.fail(function () {
							self.printToastMessage('error', "Search error", 'An error occurred while Searching');
						});
				}
			});


			connWebSocket.on('removeWebRadio', function (data) {
				var selfConnWebSocket = this;

				var response;

				response = self.commandRouter.executeOnPlugin('music_service', 'webradio', 'removeMyWebRadio', data);

				if (response != undefined) {
					response.then(function (result) {

						var response2=self.musicLibrary.executeBrowseSource('radio/myWebRadio');

						if (response2 != undefined) {
							response2.then(function (result2) {
								selfConnWebSocket.emit('pushBrowseLibrary', result2);
							})
								.fail(function () {
									self.printToastMessage('error', "Browse error", 'An error occurred while browsing the folder.');
								});
						}
						})
						.fail(function () {
							self.printToastMessage('error', "Search error", 'An error occurred while Searching');
						});
				}
			});


			// PLAYLIST MANAGEMENT
			connWebSocket.on('createPlaylist', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.playListManager.createPlaylist(data.name);
				returnedData.then(function (data) {
                    selfConnWebSocket.emit('pushListPlaylist', data);
					selfConnWebSocket.emit('pushCreatePlaylist', data);
				});


			});

			connWebSocket.on('deletePlaylist', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.playListManager.deletePlaylist(data.name);
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushListPlaylist', data);
					var response=self.musicLibrary.executeBrowseSource('playlists');

					if (response != undefined) {
						response.then(function (result) {
							selfConnWebSocket.emit('pushBrowseLibrary', result);
						})
							.fail(function () {
								self.printToastMessage('error', "Browse error", 'An error occurred while browsing the folder.');
							});
					}
				});




			});

			connWebSocket.on('listPlaylist', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.playListManager.listPlaylist();
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushListPlaylist', data);
				});


			});

			connWebSocket.on('addToPlaylist', function (data) {
			    var selfConnWebSocket = this;

                var returnedData = self.commandRouter.playListManager.addToPlaylist(data.name, data.service, data.uri);
				returnedData.then(function (data) {
                    var returnedListData = self.commandRouter.playListManager.listPlaylist();
                    returnedListData.then(function (listdata) {
                        selfConnWebSocket.emit('pushListPlaylist', listdata);
                    });

                    selfConnWebSocket.emit('pushAddToPlaylist', data);
				});

			});

			connWebSocket.on('removeFromPlaylist', function (data) {
				var selfConnWebSocket = this;
				var playlistname = data.name;
				var returnedData = self.commandRouter.playListManager.removeFromPlaylist(data.name, 'mpd', data.uri);
				returnedData.then(function (name) {
					var response=self.musicLibrary.executeBrowseSource('playlists/'+playlistname);
					if (response != undefined) {
						response.then(function (result) {
							selfConnWebSocket.emit('pushBrowseLibrary', result);
						})
							.fail(function () {
								self.printToastMessage('error', "Browse error", 'An error occurred while browsing the folder.');
							});
					}
				});


			});

			connWebSocket.on('playPlaylist', function (data) {
				var selfConnWebSocket = this;
				var returnedData = self.commandRouter.playPlaylist(data.name);

				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushPlayPlaylist', data);
				});


			});

			connWebSocket.on('enqueue', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.playListManager.enqueue(data.name);
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushEnqueue', data);
				});


			});

			//Favourites

			connWebSocket.on('addToFavourites', function (data) {
				var selfConnWebSocket = this;
				//console.log(data);

				var returnedData = self.commandRouter.playListManager.addToFavourites(data.service, data.uri, data.title);
				returnedData.then(function (data) {
					selfConnWebSocket.emit('urifavourites', data);
				});

			});

			connWebSocket.on('removeFromFavourites', function (data) {
				var selfConnWebSocket = this;
				var returnedData = self.commandRouter.playListManager.removeFromFavourites(data.name, data.service, data.uri);
				returnedData.then(function () {
					if (data.service === 'shoutcast') {
						response = self.commandRouter.executeOnPlugin('music_service', 'shoutcast', 'listRadioFavourites');
						if (response != undefined) {
							response.then(function (result) {
									selfConnWebSocket.emit('pushBrowseLibrary', result);
								})
								.fail(function () {
									self.printToastMessage('error', "Browse error", 'An error occurred while browsing the folder.');
								});
						}
					} else {
					var response = self.commandRouter.playListManager.listFavourites();
					if (response != undefined) {
						response.then(function (result) {
								selfConnWebSocket.emit('pushBrowseLibrary', result);
							})
							.fail(function () {
								self.printToastMessage('error', "Browse error", 'An error occurred while browsing the folder.');
							});
					}
					}
				});


			});

			connWebSocket.on('playFavourites', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.playListManager.playFavourites(data.name);
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushPlayFavourites', data);
				});


			});

			// Radio Favourites

			connWebSocket.on('addToRadioFavourites', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.playListManager.addToRadioFavourites('shoutcast', data.uri);
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushAddToRadioFavourites', data);
				});

			});

			connWebSocket.on('removeFromRadioFavourites', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.playListManager.removeFromRadioFavourites(data.name, 'shoutcast', data.uri);
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushRemoveFromRadioFavourites', data);
				});


			});

			connWebSocket.on('playRadioFavourites', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.playListManager.playRadioFavourites();
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushPlayRadioFavourites', data);
				});


			});


			connWebSocket.on('getSleep', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('miscellanea', 'alarm-clock', 'getSleep', data);
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushSleep', data);
				});


			});


			connWebSocket.on('setSleep', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('miscellanea', 'alarm-clock', 'setSleep', data);
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushSleep', data);
				});


			});

			connWebSocket.on('getAlarms', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('miscellanea', 'alarm-clock', 'getAlarms', '');
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushAlarm', data);
				});


			});


			connWebSocket.on('saveAlarm', function (data) {
				var selfConnWebSocket = this;
				//console.log(data);

				var returnedData = self.commandRouter.executeOnPlugin('miscellanea', 'alarm-clock', 'saveAlarm', data);
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushSleep', data);
				});



			});

			connWebSocket.on('getMultiroom', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('audio_interface', 'multiroom', 'getMultiroom', data);

				if (returnedData != undefined) {
					returnedData.then(function (data) {
						if (data != undefined) {
							selfConnWebSocket.emit('pushMultiroom', data);
						}
					});
				}
				else console.log("Plugin multiroom or method getMultiroom not found");


			});


			connWebSocket.on('setMultiroom', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('audio_interface', 'multiroom', 'setMultiroom', data);
				returnedData.then(function (data) {
					selfConnWebSocket.emit('pushMultiroom', data);
				});


			});

			connWebSocket.on('writeMultiroom', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('audio_interface', 'multiroom', 'writeMultiRoom', data);

			});

			connWebSocket.on('receiveMultiroomDeviceUpdate', function (data) {
				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'volumiodiscovery', 'receiveMultiroomDeviceUpdate', data);
			});


			connWebSocket.on('setAsMultiroomSingle', function (data) {
				//console.log("Setting as multiroomSingle");
				var returnedData = self.commandRouter.executeOnPlugin('audio_interface', 'multiroom', 'setSingle', data);

			});
			connWebSocket.on('setAsMultiroomServer', function (data) {
				//console.log("Setting as multiroomServer");
				var returnedData = self.commandRouter.executeOnPlugin('audio_interface', 'multiroom', 'setServer', data);
				//selfConnWebSocket.emit('pushWriteMultiroom',data);

			});
			connWebSocket.on('setAsMultiroomClient', function (data) {
				//console.log("Setting as multiroomClient");
				var returnedData = self.commandRouter.executeOnPlugin('audio_interface', 'multiroom', 'setClient', data);
				//selfConnWebSocket.emit('pushWriteMultiroom',data);

			});

			connWebSocket.on('shutdown', function () {
				//console.log('Received Shutdown Command');

				return self.commandRouter.shutdown();

			});

			connWebSocket.on('reboot', function () {
				//console.log('Received Reboot Command');
				return self.commandRouter.reboot();

			});

			connWebSocket.on('getWirelessNetworks', function () {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'network', 'getWirelessNetworks', '');

				if (returnedData != undefined) {
					returnedData.then(function (data) {
						selfConnWebSocket.emit('pushWirelessNetworks', data);
					});
				}
				else console.log("Error on returning wireless networks");


			});

			connWebSocket.on('saveWirelessNetworkSettings', function (data) {
				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'network', 'saveWirelessNetworkSettings', data);

				/*if (returnedData != undefined) {
				 returnedData.then(function (data) {
				 selfConnWebSocket.emit('pushSaveWirelessNetworkSettings', data);
				 });
				 }
				 else console.log("Error on returning wireless networks");*/
			});

			connWebSocket.on('getInfoNetwork', function () {
				var selfConnWebSocket = this;

				var defer = self.commandRouter.executeOnPlugin('system_controller', 'network', 'getInfoNetwork', '');

				defer.then(function (data) {
						selfConnWebSocket.emit('pushInfoNetwork', data);
					})
					.fail(function () {
						selfConnWebSocket.emit('pushInfoNetwork', {status: "Not Connected", online: "no"});
					});
			});


			//Updater
			connWebSocket.on('updateCheck', function () {

                self.commandRouter.broadcastMessage('ClientUpdateCheck', 'search-for-upgrade');

			});

            connWebSocket.on('ClientUpdateReady', function (message) {
                var selfConnWebSocket = this;

                var updateMessage = JSON.parse(message)
				self.logger.info("Update Ready: " + updateMessage);
                self.commandRouter.broadcastMessage('updateReady', updateMessage);
            });


			connWebSocket.on('update', function (data) {
				var selfConnWebSocket = this;
				self.logger.info("Update: " + data);

                self.commandRouter.broadcastMessage('ClientUpdate', {value:"now"});
                var started = { 'downloadSpeed': '','eta': '5m','progress': 1, 'status': 'Starting Software Update'};
                selfConnWebSocket.emit('updateProgress', started);
                self.commandRouter.executeOnPlugin('system_controller', 'updater_comm', 'notifyProgress', '');
			});

			connWebSocket.on('deleteUserData', function () {
				var selfConnWebSocket = this;
				self.logger.info("Command Delete User Data Received");
				self.commandRouter.executeOnPlugin('system_controller', 'system', 'deleteUserData', '');

			});

			connWebSocket.on('factoryReset', function () {
				var selfConnWebSocket = this;
				self.logger.info("Command Factory Reset Received");

				self.commandRouter.broadcastMessage('ClientFactoryReset', {value:"now"});
			});

			connWebSocket.on('getSystemVersion', function () {
				var selfConnWebSocket = this;
				self.logger.info("Received Get System Version");
				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'system', 'getSystemVersion');

				if (returnedData != undefined) {
					returnedData.then(function (data) {
						if (data != undefined) {
							selfConnWebSocket.emit('pushSystemVersion', data);
						}
					});
				}
				else console.log("Plugin multiroom or method getMultiroom not found");


			});

			/**
			 * Executes the getMyCollectionStats method on the MPD plugin
			 */
			connWebSocket.on('getMyCollectionStats', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('music_service', 'mpd', 'getMyCollectionStats', '');

				if (returnedData != undefined) {
					returnedData.then(function (data) {
						selfConnWebSocket.emit('pushMyCollectionStats', data);
					});
				}
				else console.log("Error on Wireless Scan");
			});


			/**
			 * Executes the rescanDb method on the MPD plugin. No response is foreseen
			 */
			connWebSocket.on('rescanDb', function (data) {
				self.commandRouter.executeOnPlugin('music_service', 'mpd', 'rescanDb', '');
			});

			connWebSocket.on('updateDb', function (data) {
				self.commandRouter.executeOnPlugin('music_service', 'mpd', 'updateDb', data);
			});


			/**
			 * New share APIs
			 */
			connWebSocket.on('addShare', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'networkfs', 'addShare', data);

				if (returnedData != undefined) {
					returnedData.then(function (datas) {
						selfConnWebSocket.emit(datas.emit, datas.data);
						setTimeout(function () {
						var listdata = self.commandRouter.executeOnPlugin('system_controller', 'networkfs', 'listShares', '');
						if (listdata != undefined) {
							listdata.then(function (datalist) {
								selfConnWebSocket.emit('pushListShares', datalist);
							});
						}
						}, 1000)
					});
				}
				else self.logger.error("Error on adding share");
			});

			connWebSocket.on('deleteShare', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'networkfs', 'deleteShare', data);

				if (returnedData != undefined) {
					returnedData.then(function (datas) {
						selfConnWebSocket.emit(datas.emit, datas.data);
						setTimeout(function () {
							var listdata = self.commandRouter.executeOnPlugin('system_controller', 'networkfs', 'listShares', '');
							if (listdata != undefined) {
								listdata.then(function (datalist) {
									selfConnWebSocket.emit('pushListShares', datalist);
								});
							}
						}, 1000)
					});
				}
				else self.logger.error("Error on deleting share");
			});

			connWebSocket.on('getListShares', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'networkfs', 'listShares', data);

				if (returnedData != undefined) {
					returnedData.then(function (data) {
						selfConnWebSocket.emit('pushListShares', data);
					});
				}
				else self.logger.error("Error on deleting share");
			});

			connWebSocket.on('getInfoShare', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'networkfs', 'infoShare', data);

				if (returnedData != undefined) {
					returnedData.then(function (data) {
						selfConnWebSocket.emit('pushInfoShare', data);
					});
				}
				else self.logger.error("Error on getting information on share");
			});

			connWebSocket.on('editShare', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'networkfs', 'editShare', data);

				if (returnedData != undefined) {
					returnedData.then(function (datas) {
						selfConnWebSocket.emit(datas.emit, datas.data);
						setTimeout(function () {
							var listdata = self.commandRouter.executeOnPlugin('system_controller', 'networkfs', 'listShares', '');
							if (listdata != undefined) {
								listdata.then(function (datalist) {
									selfConnWebSocket.emit('pushListShares', datalist);
								});
							}
						}, 1000)
					});
				} else self.logger.error("Error on storing on share");
			});


			connWebSocket.on('listUsbDrives', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'networkfs', 'listUsbDrives', data);

				if (returnedData != undefined) {
					returnedData.then(function (data) {
						selfConnWebSocket.emit('pushListUsbDrives', data);
					});
				}
				else self.logger.error("Error on listing USB devices");
			});


            /*
                PLUGIN INSTALLATION METHODS
             */

            /*
                Format expected: tar.gz
                data:   {uri:'http://....../plugin.tar.gz'}
             */
            connWebSocket.on('installPlugin', function (data) {
                var selfConnWebSocket = this;

                var returnedData = self.commandRouter.installPlugin(data.url);

                if (returnedData != undefined) {
                    returnedData.then(function (data) {
                        selfConnWebSocket.emit('pushInstallPlugin', data);
						var installed = self.commandRouter.getInstalledPlugins();
						if (installed != undefined) {
							installed.then(function (installedPLugins) {
								self.broadcastMessage('pushInstalledPlugins',installedPLugins);
							});
						}
						var available = self.commandRouter.getAvailablePlugins();
						if (available != undefined) {
							available.then(function (AvailablePlugins) {
								selfConnWebSocket.emit('pushAvailablePlugins',AvailablePlugins);
							});
						}
                    });
                }
                else self.logger.error("Error on installing plugin");
            });

			connWebSocket.on('updatePlugin', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.updatePlugin(data);

				if (returnedData != undefined) {
					returnedData.then(function (data) {
						selfConnWebSocket.emit('pushInstallPlugin', data);
						var installed = self.commandRouter.getInstalledPlugins();
						if (installed != undefined) {
							installed.then(function (installedPLugins) {
								self.logger.info(JSON.stringify(installedPLugins));
								selfConnWebSocket.emit('pushInstalledPlugins',installedPLugins);
							});
						}
						var available = self.commandRouter.getAvailablePlugins();
						if (available != undefined) {
							available.then(function (AvailablePlugins) {
								selfConnWebSocket.emit('pushAvailablePlugins',AvailablePlugins);
							});
						}
					});
				}
				else self.logger.error("Error on installing plugin");
			});

            connWebSocket.on('unInstallPlugin', function (data) {
                var selfConnWebSocket = this;

                var returnedData = self.commandRouter.unInstallPlugin(data);

                if (returnedData != undefined) {
                    returnedData.then(function (data) {
                        selfConnWebSocket.emit('pushUnInstallPlugin', data);
						var installed = self.commandRouter.getInstalledPlugins();
						if (installed != undefined) {
							installed.then(function (installedPLugins) {
								self.logger.info(JSON.stringify(installedPLugins));
								selfConnWebSocket.emit('pushInstalledPlugins',installedPLugins);
							});
						}
						var available = self.commandRouter.getAvailablePlugins();
						if (available != undefined) {
							available.then(function (AvailablePlugins) {
								selfConnWebSocket.emit('pushAvailablePlugins',AvailablePlugins);
							});
						}
                    });
                }
                else self.logger.error("Error on installing plugin");
            });

            connWebSocket.on('enablePlugin', function (data) {
                var selfConnWebSocket = this;

                var returnedData = self.commandRouter.enablePlugin(data);

                if (returnedData != undefined) {
                    returnedData.then(function (data) {
                        selfConnWebSocket.emit('pushEnablePlugin', data);
						var installed = self.commandRouter.getInstalledPlugins();
						if (installed != undefined) {
							installed.then(function (installedPLugins) {
								self.logger.info(JSON.stringify(installedPLugins));
								selfConnWebSocket.emit('pushInstalledPlugins',installedPLugins);
							});
						}
                    });
                }
                else self.logger.error("Error on installing plugin");
            });

            connWebSocket.on('disablePlugin', function (data) {
                var selfConnWebSocket = this;

                var returnedData = self.commandRouter.disablePlugin(data);

                if (returnedData != undefined) {
                    returnedData.then(function (data) {
                        selfConnWebSocket.emit('pushDisablePlugin', data);
						var installed = self.commandRouter.getInstalledPlugins();
						if (installed != undefined) {
							installed.then(function (installedPLugins) {
								self.logger.info(JSON.stringify(installedPLugins));
								selfConnWebSocket.emit('pushInstalledPlugins',installedPLugins);
							});
						}
                    });
                }
                else self.logger.error("Error on disabling plugin");
            });

            connWebSocket.on('modifyPluginStatus', function (data) {
                var selfConnWebSocket = this;

                var returnedData = self.commandRouter.modifyPluginStatus(data);

                if (returnedData != undefined) {
                    returnedData.then(function (data) {
                        selfConnWebSocket.emit('pushModifyPluginStatus', data);
						var installed = self.commandRouter.getInstalledPlugins();
						if (installed != undefined) {
							installed.then(function (installedPLugins) {
								self.logger.info(JSON.stringify(installedPLugins));
								selfConnWebSocket.emit('pushInstalledPlugins',installedPLugins);
							});
						}
                    });
                }
                else self.logger.error("Error on disabling plugin");
            });

            connWebSocket.on('getInstalledPlugins', function (pippo) {
                var selfConnWebSocket = this;

                var returnedData = self.commandRouter.getInstalledPlugins();

                if (returnedData != undefined) {
                    returnedData.then(function (installedPLugins) {
                        self.logger.info(JSON.stringify(installedPLugins));
                        selfConnWebSocket.emit('pushInstalledPlugins',installedPLugins);
                    });
                }
                else self.logger.error("Error on getting installed plugins");
            });

			connWebSocket.on('getAvailablePlugins', function (pippo) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.getAvailablePlugins();

				if (returnedData != undefined) {
					returnedData.then(function (AvailablePlugins) {
						selfConnWebSocket.emit('pushAvailablePlugins',AvailablePlugins);
					});
				}
				else self.logger.error("Error on getting Available plugins");
			});

			connWebSocket.on('getPluginDetails', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.getPluginDetails(data);

				if (returnedData != undefined) {
					returnedData.then(function (Details) {
						selfConnWebSocket.emit('openModal',Details);
					});
				}
				else self.logger.error("Error on getting Plugin Details");
			});

            connWebSocket.on('pluginManager', function (data) {
                var selfConnWebSocket = this;

                if(data.action==='getUiConfig')
                {
                    return self.commandRouter.executeOnPlugin(data.category,data.name,'getUiConfig');
                }
                else if(data.action==='setUiConfig')
                {
                    return self.commandRouter.executeOnPlugin(data.category,data.name,'setUiConfig',data);
                }
                else if(data.action==='enable')
                {
					var returnedData = self.commandRouter.enableAndStartPlugin(data.category,data.name);


						returnedData.then(function (data) {
							var installed = self.commandRouter.getInstalledPlugins();
							if (installed != undefined) {
								installed.then(function (installedPLugins) {
									selfConnWebSocket.emit('pushInstalledPlugins',installedPLugins);
								});
							}
						});

                }
                else if(data.action==='disable')
                {
					var returnedData = self.commandRouter.disableAndStopPlugin(data.category,data.name);

					if (returnedData != undefined) {
						returnedData.then(function (data) {
							selfConnWebSocket.emit('pushDisablePlugin', data);
							var installed = self.commandRouter.getInstalledPlugins();
							if (installed != undefined) {
								installed.then(function (installedPLugins) {
									selfConnWebSocket.emit('pushInstalledPlugins',installedPLugins);
								});
							}
						});
					}
                }
            });


            connWebSocket.on('preUninstallPlugin', function (data) {
                var selfConnWebSocket = this;


                selfConnWebSocket.emit('openModal', {'title':self.commandRouter.getI18nString('PLUGINS.CONFIRM_PLUGIN_UNINSTALL'), 'message':self.commandRouter.getI18nString('PLUGINS.CONFIRM_PLUGIN_UNINSTALL_MESSAGE')+'?', 'buttons':[{'name':self.commandRouter.getI18nString('PLUGINS.UNINSTALL'), 'class':'btn btn-info', 'emit':'unInstallPlugin', 'payload':{'category':data.category,'name':data.name}},{'name':self.commandRouter.getI18nString('COMMON.CANCEL'),'class':'btn btn-warning'}]});

            });



	connWebSocket.on('saveQueueToPlaylist', function (data) {
                var selfConnWebSocket = this;

		var returnedData = self.commandRouter.volumioSaveQueueToPlaylist(data.name);

                if (returnedData != undefined) {
                    returnedData.then(function (data) {
                        selfConnWebSocket.emit('pushSaveQueueToPlaylist', data);
		    });
                }
                else self.logger.error("Error on saving queue to playlist");


            });

            connWebSocket.on('setConsume', function (data) {
                var selfConnWebSocket = this;

                var returnedData = self.commandRouter.volumioConsume(data.value);

                if (returnedData != undefined) {
                    returnedData.then(function (data) {
                        selfConnWebSocket.emit('pushSetConsume', data);
                    });
                }
                else self.logger.error("Error on setting consume mode");


            });


            connWebSocket.on('moveQueue', function (data) {
                var selfConnWebSocket = this;

                var returnedData = self.commandRouter.volumioMoveQueue(data.from,data.to);

                if (returnedData != undefined) {
                    returnedData.then(function (data) {
                        selfConnWebSocket.emit('pushQueue', data);
                    });
                }
                else self.logger.error("Error on moving item in list");


            });

			connWebSocket.on('getUiSettings', function () {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'getUiSettings', '');

				if (returnedData != undefined) {
					returnedData.then(function (data) {
						selfConnWebSocket.emit('pushUiSettings', data);
					});
				}
				else self.logger.error("Cannot get UI Settings");


			});

			connWebSocket.on('getBackgrounds', function () {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'getBackgrounds', '');

				if (returnedData != undefined) {
					returnedData.then(function (data) {
						selfConnWebSocket.emit('pushBackgrounds', data);
					});
				}
				else self.logger.error("Cannot get UI Settings");


			});

			connWebSocket.on('setBackgrounds', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'setBackgrounds', data);

				if (returnedData != undefined) {
						var backgrounds=self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'getBackgrounds', '');
						if (backgrounds != undefined) {
							backgrounds.then(function (backgroundsdata) {
								selfConnWebSocket.emit('pushBackgrounds', backgroundsdata);
								var returnedData2 = self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'getUiSettings', '');

								if (returnedData2 != undefined) {
									returnedData2.then(function (data2) {
										selfConnWebSocket.emit('pushUiSettings', data2);
									});
								}


							});
						}
				}
				else self.logger.error("Cannot set UI Settings");

			});

			connWebSocket.on('deleteBackground', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'deleteBackgrounds', data);

				if (returnedData != undefined) {
					returnedData.then(function (backgroundsdata) {
							selfConnWebSocket.emit('pushBackgrounds', backgroundsdata);
						});
					}
				else self.logger.error("Cannot Delete Image");
			});

			connWebSocket.on('regenerateThumbnails', function (data) {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'generateThumbnails', '' );

				if (returnedData != undefined) {
					var backgrounds=self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'getBackgrounds', '');
					if (backgrounds != undefined) {
						backgrounds.then(function (backgroundsdata) {
							setTimeout(function () {
							self.libSocketIO.sockets.emit('pushBackgrounds', backgroundsdata);
							}, 1000)
						});
					}
				}
				else self.logger.error("Cannot Regenerate Thumbnails");
			});

			connWebSocket.on('getNetworkSharesDiscovery', function () {
				var selfConnWebSocket = this;

				var returnedData = self.commandRouter.executeOnPlugin('system_controller', 'networkfs', 'discoverShares', '');

				if (returnedData != undefined) {
					returnedData.then(function (data) {
							selfConnWebSocket.emit('pushNetworkSharesDiscovery', data);
						});
					}

			});

			connWebSocket.on('getWizard', function () {
				var selfConnWebSocket = this;

                var showWizard = self.commandRouter.executeOnPlugin('miscellanea', 'wizard', 'getShowWizard', '');
				selfConnWebSocket.emit('pushWizard', {"openWizard": showWizard});
			});

            connWebSocket.on('runFirstConfigWizard', function () {
                var selfConnWebSocket = this;

                selfConnWebSocket.emit('pushWizard', {"openWizard": true});
            });

			connWebSocket.on('getWizardSteps', function () {
				var selfConnWebSocket = this;

				var wizardSteps = self.commandRouter.executeOnPlugin('miscellanea', 'wizard', 'getWizardSteps', '');
				selfConnWebSocket.emit('pushWizardSteps', wizardSteps);
			});

            connWebSocket.on('setWizardAction', function (data) {
                var selfConnWebSocket = this;

               return self.commandRouter.executeOnPlugin('miscellanea', 'wizard', 'setWizardAction', data);
            });

            connWebSocket.on('getWizardUiConfig', function (data) {
                var selfConnWebSocket = this;

                var wizardConfig = self.commandRouter.executeOnPlugin('miscellanea', 'wizard', 'getWizardConfig', data);

                if (wizardConfig != undefined) {
                    wizardConfig.then(function (data) {
                        selfConnWebSocket.emit('pushUiConfig', data);
                    });
                }
            });

			connWebSocket.on('getAvailableLanguages', function () {
				var selfConnWebSocket = this;

				//var languages =  {'defaultLanguage':{'language': 'English', 'code': 'en'}, 'available':[{'language': 'English', 'code': 'en'},{'language': 'Italiano', 'code': 'it'}]};
				var languages = self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'getAvailableLanguages', '');

				if (languages != undefined) {
					languages.then(function (data) {
						selfConnWebSocket.emit('pushAvailableLanguages', data);
					});
				}
			});

			connWebSocket.on('setLanguage', function (data) {
				//var self = this;
				var disallowReload = false;
				var value = data.defaultLanguage.code;
				var label = data.defaultLanguage.language;
				if (data.disallowReload != undefined) {
                    disallowReload = data.disallowReload;
				}
				var languagedata = {'language':{'value':value,'label':label}, 'disallowReload': disallowReload}

				//var lang = self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'setLanguage', languagedata);
				var name = self.commandRouter.executeOnPlugin('miscellanea', 'appearance', 'setLanguage', languagedata);
			});



			connWebSocket.on('getDeviceName', function () {
				var selfConnWebSocket = this;

				var name = self.commandRouter.sharedVars.get('system.name');
				selfConnWebSocket.emit('pushDeviceName', {'name':name});
			});

			connWebSocket.on('setDeviceName', function (data) {
				var selfConnWebSocket = this;
				var options = {'player_name':data.name};
				var name = self.commandRouter.executeOnPlugin('system_controller', 'system', 'saveGeneralSettings', options);
			});

			connWebSocket.on('getOutputDevices', function () {
				var selfConnWebSocket = this;

				var audiolist = self.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'getAudioDevices', '');

				if (audiolist != undefined) {
					audiolist.then(function (data) {
						selfConnWebSocket.emit('pushOutputDevices', data);
					});
				}
			});

			connWebSocket.on('setOutputDevices', function (data) {
				var selfConnWebSocket = this;
				data.disallowPush = true;

                return self.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'saveAlsaOptions', data);
			});


			connWebSocket.on('getDonePage', function () {
				var selfConnWebSocket = this;


				var donation = self.commandRouter.executeOnPlugin('miscellanea', 'wizard', 'getDonation', '');
				var contributionsarray =  self.commandRouter.executeOnPlugin('miscellanea', 'wizard', 'getDonationsArray', '');
				var lastStepMessage = self.commandRouter.executeOnPlugin('miscellanea', 'wizard', 'getDoneMessage', '');
				var laststep = {"congratulations":lastStepMessage.congratulations, "title":lastStepMessage.title,"message":lastStepMessage.message,"donation":donation, "donationAmount": contributionsarray};

				selfConnWebSocket.emit('pushDonePage', laststep);
			});

			connWebSocket.on('checkPassword', function (data) {
				var selfConnWebSocket = this;


				var check = self.commandRouter.executeOnPlugin('system_controller', 'system', 'checkPassword', data);

				if (check != undefined) {
					check.then(function (data) {
						selfConnWebSocket.emit('checkPassword', data);
					});
				}


			});

            connWebSocket.on('connectWirelessNetworkWizard', function (data) {
                var selfConnWebSocket = this;

                var connectWifiWizard = self.commandRouter.executeOnPlugin('miscellanea', 'wizard', 'connectWirelessNetwork', data);

                if (connectWifiWizard != undefined) {
                    connectWifiWizard.then(function (data) {
                        selfConnWebSocket.emit('pushWizardWirelessConnResults', data);
                    });
                }


            });

            connWebSocket.on('safeRemoveDrive', function (data) {
                var selfConnWebSocket = this;

                var remove = self.commandRouter.safeRemoveDrive(data);

                if (remove != undefined) {
                    remove.then(function (result) {
                        selfConnWebSocket.emit('pushBrowseLibrary', result);
                    })
                        .fail(function () {
                        });
                }
            });

            connWebSocket.on('installToDisk', function (data) {
                var selfConnWebSocket = this;

                var installDisk = self.commandRouter.executeOnPlugin('system_controller', 'system', 'installToDisk', data);

                if (installDisk != undefined) {
                    installDisk.then(function (result) {
                        selfConnWebSocket.emit('pushInstallToDisk', result);
                    })
                        .fail(function () {
                        });
                }
            });

            connWebSocket.on('getMyVolumioStatus', function () {
                var selfConnWebSocket = this;

                var remove = self.commandRouter.getMyVolumioStatus();

                if (remove != undefined) {
                    remove.then(function (result) {
                        selfConnWebSocket.emit('pushMyVolumioStatus', result);
                    })
                        .fail(function () {
                        });
                }
            });

            connWebSocket.on('getMyVolumioToken', function (data) {
                var selfConnWebSocket = this;

                var remove = self.commandRouter.getMyVolumioToken(data);

                if (remove != undefined) {
                    remove.then(function (result) {
                        selfConnWebSocket.emit('pushMyVolumioToken', result);
                    })
                        .fail(function () {
                        });
                }
            });

            connWebSocket.on('setMyVolumioToken', function (data) {
                var selfConnWebSocket = this;

                var token = self.commandRouter.setMyVolumioToken(data);

                if (token != undefined) {
                    token.then(function (result) {
                        self.commandRouter.broadcastMessage('pushMyVolumioToken', {"token":result});
                    })
                        .fail(function () {
                        });
                }
            });

            connWebSocket.on('myVolumioLogout', function () {
                var selfConnWebSocket = this;

                self.commandRouter.broadcastMessage('pushMyVolumioLogout', '');

                return self.commandRouter.myVolumioLogout();
            });

            connWebSocket.on('enableMyVolumioDevice', function (device) {
                var selfConnWebSocket = this;

                var enable = self.commandRouter.enableMyVolumioDevice(device);

                if (enable != undefined) {
                    enable.then(function (result) {
                        //selfConnWebSocket.emit('pushMyVolumioStatus', result);
                    })
                        .fail(function () {
                        });
                }
            });

            connWebSocket.on('disableMyVolumioDevice', function (device) {
                var selfConnWebSocket = this;

                var disable = self.commandRouter.disableMyVolumioDevice(device);

                if (disable != undefined) {
                    disable.then(function (result) {
                        //selfConnWebSocket.emit('pushMyVolumioStatus', result);
                    })
                        .fail(function () {
                        });
                }
            });

            connWebSocket.on('deleteMyVolumioDevice', function (device) {
                var selfConnWebSocket = this;

                var deleteDevice = self.commandRouter.deleteMyVolumioDevice(device);

                if (deleteDevice != undefined) {
                    deleteDevice.then(function (result) {
                        //selfConnWebSocket.emit('pushMyVolumioStatus', result);
                    })
                        .fail(function () {
                        });
                }
            });

	});
};

// Receive console messages from commandRouter and broadcast to all connected clients
InterfaceWebUI.prototype.printConsoleMessage = function (message) {
	var self = this;

	// Push the message all clients
	self.libSocketIO.emit('printConsoleMessage', message);

	// Return a resolved empty promise to represent completion
	return libQ.resolve();
};

// Receive player queue updates from commandRouter and broadcast to all connected clients
InterfaceWebUI.prototype.pushQueue = function (queue, connWebSocket) {
	var self = this;

	// If a specific client is given, push to just that client
	if (connWebSocket) {
		return libQ.fcall(connWebSocket.emit.bind(connWebSocket), 'pushQueue', queue);
		// Else push to all connected clients
	} else {
		return libQ.fcall(self.libSocketIO.emit.bind(self.libSocketIO), 'pushQueue', queue);
	}
};

// Push the library root
InterfaceWebUI.prototype.pushLibraryFilters = function (browsedata, connWebSocket) {
	var self = this;

	// If a specific client is given, push to just that client
	if (connWebSocket) {
		return libQ.fcall(connWebSocket.emit.bind(connWebSocket), 'pushLibraryFilters', browsedata);
	}
};

// Receive music library data from commandRouter and send to requester
InterfaceWebUI.prototype.pushLibraryListing = function (browsedata, connWebSocket) {
	var self = this;

	// If a specific client is given, push to just that client
	if (connWebSocket) {
		return libQ.fcall(connWebSocket.emit.bind(connWebSocket), 'pushLibraryListing', browsedata);
	}
};

// Push the playlist view
InterfaceWebUI.prototype.pushPlaylistIndex = function (browsedata, connWebSocket) {
	var self = this;

	// If a specific client is given, push to just that client
	if (connWebSocket) {
		return libQ.fcall(connWebSocket.emit.bind(connWebSocket), 'pushPlaylistIndex', browsedata);
	}
};

InterfaceWebUI.prototype.pushMultiroom = function (selfConnWebSocket) {
	var self = this;
	//console.log("pushMultiroom 2");
	var volumiodiscovery = self.commandRouter.pluginManager.getPlugin('system_controller', 'volumiodiscovery');
	if (volumiodiscovery) {
	var response = volumiodiscovery.getDevices();
	if(response != undefined){
	selfConnWebSocket.emit('pushMultiRoomDevices', response);
	}
	}
}


// Receive player state updates from commandRouter and broadcast to all connected clients
InterfaceWebUI.prototype.pushState = function (state, connWebSocket) {
	var self = this;

	if (connWebSocket) {
		self.pushMultiroom(connWebSocket);
		return libQ.fcall(connWebSocket.emit.bind(connWebSocket), 'pushState', state);

	} else {
		// Push the updated state to all clients
		self.pushMultiroom(self.libSocketIO);
		return libQ.fcall(self.libSocketIO.emit.bind(self.libSocketIO), 'pushState', state);
	}
};


InterfaceWebUI.prototype.printToastMessage = function (type, title, message) {
	var self = this;

	// Push the message all clients
	self.libSocketIO.emit('pushToastMessage', {
		type: type,
		title: title,
		message: message
	});
};

InterfaceWebUI.prototype.broadcastToastMessage = function (type, title, message) {
	var self = this;

	// Push the message all clients
	self.libSocketIO.sockets.emit('pushToastMessage', {
		type: type,
		title: title,
		message: message
	});
};

InterfaceWebUI.prototype.pushMultiroomDevices = function (msg) {
	this.libSocketIO.emit('pushMultiRoomDevices', msg);
};

InterfaceWebUI.prototype.logDone = function (timeStart) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + '------------------------------ ' + (Date.now() - timeStart) + 'ms');
	return libQ.resolve();
};

InterfaceWebUI.prototype.logStart = function (sCommand) {
	var self = this;
	self.commandRouter.pushConsoleMessage('\n' + '[' + Date.now() + '] ' + '---------------------------- ' + sCommand);
	return libQ.resolve();
};

// Pass the error if we don't want to handle it
InterfaceWebUI.prototype.pushError = function (error) {
	if ((typeof error) === 'string') {
		return this.commandRouter.pushConsoleMessage.call(this.commandRouter, 'Error: ' + error);
	} else if ((typeof error) === 'object') {
		return this.commandRouter.pushConsoleMessage.call(this.commandRouter, 'Error:\n' + error.stack);
	}
	// Return a resolved empty promise to represent completion
	return libQ.resolve();
};

InterfaceWebUI.prototype.pushAirplay = function (value) {
	this.logger.debug("Pushing airplay mode: s" + value);
	this.libSocketIO.sockets.emit('pushAirplay', value);
};

InterfaceWebUI.prototype.emitFavourites = function (value) {
	var self = this;

	self.logger.info("Pushing Favourites " + JSON.stringify(value));
	self.libSocketIO.sockets.emit('urifavourites', value);
};

InterfaceWebUI.prototype.broadcastMessage = function(emit,payload) {
	if(emit.msg && emit.value) {
		this.libSocketIO.sockets.emit(emit.msg,emit.value);
	} else {
		this.libSocketIO.sockets.emit(emit,payload);
	}
};



