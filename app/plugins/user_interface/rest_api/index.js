'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var api = require('/volumio/http/restapi.js');
var bodyParser = require('body-parser');
var ifconfig = require('wireless-tools/ifconfig');

module.exports = interfaceApi;

function interfaceApi(context) {
    var self = this;

    self.context = context;
    self.commandRouter = self.context.coreCommand;
    self.musicLibrary = self.commandRouter.musicLibrary;
    var notFound = {'Error': "Error 404: resource not found"};
    var success = {'Message': "Succesfully restored resource"};

    self.logger = self.commandRouter.logger;

    this.setIPAddress();

    api.route('/backup/playlists/:type')
        .get(function (req, res) {

            var type = {'type': req.params.type};

            var response = self.commandRouter.loadBackup(type);

            if (response._data != undefined)
                res.json(response._data);
            else
                res.json(notFound);
        });
    /*
    api.route('/backup/config/')
        .get(function (req, res) {
            var response = self.commandRouter.getPluginsConf();

            if (response != undefined)
                res.json(response);
            else
                res.json(notFound);
        });
    */

    api.route('/restore/playlists/')
        .post(function (req, res) {
            var response = {'Error': "Error: impossible to restore given data"};

            try{
                self.commandRouter.restorePlaylist({'type': req.body.type, 'backup': JSON.parse(req.body.data)});
                res.json(success);
            }catch(e){
                res.json(response);
            }
        });

    /*
    api.route('/restore/config/')
        .post(function (req, res) {
            var response = {'Error': "Error: impossible to restore configurations"};

            try{
                var bobby = JSON.parse(req.body.config);
                self.commandRouter.restorePluginsConf(JSON.parse(req.body.config));
                res.json(success);
            }catch(e){
                res.json(response);
            }
        });
    */
    api.route('/commands')
        .get(function (req, res) {
            var response = {'Error': "Error: impossible to execute command"};

            try{
                if(req.query.cmd == "play"){
                    var timeStart = Date.now();
                    if (req.query.N == undefined) {
                        self.logStart('Client requests Volumio play')
                            .then(self.commandRouter.volumioPlay.bind(self.commandRouter))
                            .fail(self.pushError.bind(self))
                            .done(function () {
                                res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                            });
                    } else {
                        var N = parseInt(req.query.N);
                        self.logStart('Client requests Volumio play at index '+ N)
                            .then(self.commandRouter.volumioPlay.bind(self.commandRouter,N))
                            .done(function () {
                                res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                            });
                    }
                }
                else if (req.query.cmd == "toggle"){
                    var timeStart = Date.now();
                    self.logStart('Client requests Volumio toggle')
                        .then(self.commandRouter.volumioToggle.bind(self.commandRouter))
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if (req.query.cmd == "stop"){
                    var timeStart = Date.now();
                    self.logStart('Client requests Volumio stop')
                        .then(self.commandRouter.volumioStop.bind(self.commandRouter))
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if (req.query.cmd == "pause"){
                    var timeStart = Date.now();
                    self.logStart('Client requests Volumio pause')
                        .then(self.commandRouter.volumioPause.bind(self.commandRouter))
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if (req.query.cmd == "clearQueue"){
                    var timeStart = Date.now();
                    self.logStart('Client requests Volumio Clear Queue')
                        .then(self.commandRouter.volumioClearQueue.bind(self.commandRouter))
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd == "prev"){
                    var timeStart = Date.now();
                    self.logStart('Client requests Volumio previous')
                        .then(self.commandRouter.volumioPrevious.bind(self.commandRouter))
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd == "next"){
                    var timeStart = Date.now();
                    self.logStart('Client requests Volumio next')
                        .then(self.commandRouter.volumioNext.bind(self.commandRouter))
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd == "volume"){
                    var VolumeInteger = req.query.volume;
                    if (VolumeInteger == "plus") {
                        VolumeInteger = '+';
                    } else if (VolumeInteger == "minus"){
                        VolumeInteger = '-';
                    }
                    else if (VolumeInteger == "mute" || VolumeInteger == "unmute" || VolumeInteger == "toggle") {

                    } else {
                        VolumeInteger = parseInt(VolumeInteger);
                    }

                    var timeStart = Date.now();
                    self.logStart('Client requests Volume ' + VolumeInteger)
                        .then(function () {
                            return self.commandRouter.volumiosetvolume.call(self.commandRouter,
                                VolumeInteger);
                        })
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd == "playplaylist"){
                    var playlistName = req.query.name;
                    var timeStart = Date.now();
                    self.logStart('Client requests Volumio Play Playlist '+playlistName)
                        .then(function () {
                            return self.commandRouter.playPlaylist.call(self.commandRouter,
                                playlistName);
                        })
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd=="seek"){
                    var position = req.query.position;
                    if(position == "plus") {
                        position = '+';
                    }
                    else if (position == "minus"){
                        position = '-';
                    }
                    else {
                        position = parseInt(position);
                    }

                    var timeStart = Date.now();
                    self.logStart('Client requests Position ' + position)
                        .then(function () {
                            return self.commandRouter.volumioSeek(position);
                        })
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd == "repeat"){
                    var value = req.query.value;
                    if(value == "true"){
                        value = true;
                    }
                    else if (value == "false"){
                        value = false;
                    }

                    var timeStart = Date.now();
                    self.logStart('Client requests Repeat ' + value)
                        .then(function () {
                            if(value != undefined) {
                                return self.commandRouter.volumioRepeat(value, false);
                            }
                            else{
                                return self.commandRouter.repeatToggle();
                            }
                        })
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd == "random"){
                    var value = req.query.value;
                    if(value == "true"){
                        value = true;
                    }
                    else if (value == "false"){
                        value = false;
                    }

                    var timeStart = Date.now();
                    self.logStart('Client requests Random ' + value)
                        .then(function () {
                            if(value != undefined) {
                                return self.commandRouter.volumioRandom(value);
                            }
                            else{
                                return self.commandRouter.randomToggle();
                            }
                        })
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd == "startAirplay"){
                    var timeStart = Date.now();
                    self.logStart('Client requests Start Airplay metadata parsing')
                        .then(function () {
                            self.commandRouter.executeOnPlugin('music_service', 'airplay_emulation', 'startAirplayMeta', '');
                        })
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd == "stopAirplay"){
                    var timeStart = Date.now();
                    self.logStart('Client requests Start Airplay metadata parsing')
                        .then(function () {
                            self.commandRouter.executeOnPlugin('music_service', 'airplay_emulation', 'airPlayStop', '');
                        })
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd == "usbAudioAttach"){
                    var timeStart = Date.now();
                    self.logStart('USB Audio Device Attached')
                        .then(function () {
                            self.commandRouter.usbAudioAttach();
                        })
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else if(req.query.cmd == "usbAudioDetach"){
                    var timeStart = Date.now();
                    self.logStart('USB Audio Device Detached')
                        .then(function () {
                            self.commandRouter.usbAudioDetach();
                        })
                        .fail(self.pushError.bind(self))
                        .done(function () {
                            res.json({'time':timeStart, 'response':req.query.cmd + " Success"});
                        });
                }
                else{
                    res.json({'Error': "command not recognized"});
                }
            } catch(e){
                self.commandRouter.logger.info("Error executing command");
                res.json(response);
            }
        });

    api.use('/v1', api);
    api.use(bodyParser.json());

    api.route('/ping')
        .get(function (req, res) {
            res.send('pong');
        });

    api.route('/getstate')
        .get(function (req, res) {


            var response = self.commandRouter.volumioGetState();

            if (response != undefined)
                res.json(response);
            else
                res.json(notFound);
        });

    api.route('/listplaylists')
        .get(function (req, res) {

            var response = self.commandRouter.playListManager.listPlaylist();

            var response = self.commandRouter.playListManager.listPlaylist();
            response.then(function (data) {
                if (data != undefined) {
                    res.json(data);
                } else {
                    res.json(notFound);
                }
            });
        });

    api.route('/pluginEndpoint')
        .post(function (req, res) {
            var result = self.executeRestEndpoint(req.body);
            result.then(function(response) {
                res.json({'success': true});
            })
            .fail(function(error){
                res.json({'success': false, 'error': error});
            })
        })
        .get(function (req, res) {
            var result = self.executeRestEndpoint(req.query);
            result.then(function(response) {
                res.json({'success': true});
            })
            .fail(function(error){
                res.json({'success': false, 'error': error});
            })
        });



    // V2 methods

    this.browse=new (require(__dirname+'/browse.js'))(context);
    this.playback=new (require(__dirname+'/playback.js'))(context);

    // Listings
    api.get('/v2/listing/browse', this.browse.browseListing.bind(this.browse));
    api.get('/v2/listing/collectionstats', this.browse.getCollectionStats.bind(this.browse));
    api.get('/v2/listing/getzones', this.browse.getZones.bind(this.browse));

    // Playback
    api.get('/v2/playback/status', this.playback.playbackGetStatus.bind(this.playback));
    api.post('/v2/playback/play', this.playback.playbackPlay.bind(this.playback));
    api.post('/v2/playback/stop', this.playback.playbackStop.bind(this.playback));
    api.post('/v2/playback/pause', this.playback.playbackPause.bind(this.playback));
    api.post('/v2/playback/resume', this.playback.playbackResume.bind(this.playback));
    api.post('/v2/playback/next', this.playback.playbackNext.bind(this.playback));
    api.post('/v2/playback/previous', this.playback.playbackPrevious.bind(this.playback));
    api.post('/v2/playback/seek', this.playback.playbackSeek.bind(this.playback));
    api.put('/v2/playback/random', this.playback.playbackRandom.bind(this.playback));
    api.get('/v2/playback/random', this.playback.playbackGetRandom.bind(this.playback));
    api.put('/v2/playback/repeat', this.playback.playbackRepeat.bind(this.playback));
    api.get('/v2/playback/repeat', this.playback.playbackGetRepeat.bind(this.playback));
    api.put('/v2/playback/consume', this.playback.playbackConsume.bind(this.playback));
    api.get('/v2/playback/consume', this.playback.playbackGetConsume.bind(this.playback));
    api.put('/v2/playback/volume', this.playback.playbackVolume.bind(this.playback));
    api.get('/v2/playback/volume', this.playback.playbackGetVolume.bind(this.playback));
    api.put('/v2/playback/mute', this.playback.playbackMute.bind(this.playback));
    api.get('/v2/playback/mute', this.playback.playbackGetMute.bind(this.playback));
    api.post('/v2/playback/ffwdrew', this.playback.ffwdRew.bind(this.playback));
    api.get('/v2/playback/queue', this.playback.playbackGetQueue.bind(this.playback));

};

interfaceApi.prototype.printConsoleMessage = function (message) {
    var self = this;
    self.logger.debug("API:printConsoleMessage");
    return libQ.resolve();
};

interfaceApi.prototype.pushQueue = function (queue) {
    var self = this;
    self.logger.debug("API:pushQueue");
};

interfaceApi.prototype.pushLibraryFilters = function (browsedata) {
    var self = this;
    self.logger.debug("API:pushLibraryFilters");
};

interfaceApi.prototype.pushLibraryListing = function (browsedata) {
    var self = this;
    self.logger.debug("API:pushLibraryListing");
};

interfaceApi.prototype.pushPlaylistIndex = function (browsedata, connWebSocket) {
    var self = this;
    self.logger.debug("API:pushPlaylistIndex");

};

interfaceApi.prototype.pushMultiroom = function () {
    var self = this;
    self.logger.debug("Api push multiroom");
};


interfaceApi.prototype.pushState = function (state) {
    var self = this;
    self.logger.debug("API:pushState");
};


interfaceApi.prototype.printToastMessage = function (type, title, message) {
    var self = this;
    self.logger.debug("API:printToastMessage");
};

interfaceApi.prototype.broadcastToastMessage = function (type, title, message) {
    var self = this;
    self.logger.debug("API:broadcastToastMessage");
};

interfaceApi.prototype.pushMultiroomDevices = function (msg) {
    var self = this;
    self.logger.debug("API:pushMultiroomDevices");
};

interfaceApi.prototype.pushError = function (error) {
    var self = this;
    self.logger.error("API:pushError: " + error);
    return libQ.resolve();
};

interfaceApi.prototype.pushAirplay = function (value) {
    var self = this;
    self.logger.debug("API:pushAirplay");
};

interfaceApi.prototype.emitFavourites = function (value) {
    var self = this;
    self.logger.debug("API:emitFavourites");
};

interfaceApi.prototype.broadcastMessage = function() {
    var self = this;
    self.logger.debug("API:emitFavourites");
};

interfaceApi.prototype.logStart = function (sCommand) {
    var self = this;
    self.commandRouter.pushConsoleMessage('\n' + '---------------------------- ' + sCommand);
    return libQ.resolve();
};

interfaceApi.prototype.executeRestEndpoint = function(data) {
    var self = this;
    var executed = false;
    var defer = libQ.defer();
    
    var pluginsRestEndpoints = self.commandRouter.getPluginsRestEndpoints();
    if (pluginsRestEndpoints.length && data.endpoint) {
        for (var i in pluginsRestEndpoints) {
            var endpoint = pluginsRestEndpoints[i];
            if (data.endpoint === endpoint.endpoint) {
                executed = true;
                self.logger.info('Executing endpoint ' + endpoint.endpoint);
                var execute = self.commandRouter.executeOnPlugin(endpoint.type, endpoint.name, endpoint.method, data.data);
                if (Promise.resolve(execute) == execute) {
                    execute.then(function(result) {
                        defer.resolve(result);
                    })
                } else {
                    defer.resolve('OK');
                }
            }
        }
        if (!executed) {
            var message = 'No valid Plugin REST Endpoint: ' + data.endpoint
            self.logger.info(message);
            defer.reject(message);
        }
    } else {
        var message = 'No valid Plugin REST Endpoint';
        self.logger.info(message);
        defer.reject(message);
    }

    return defer.promise
};


interfaceApi.prototype.setIPAddress=function()
{
    var self = this;

    ifconfig.status('wlan0',(err, status) => {
        if(err) {
            ifconfig.status('eth0',(err, status) => {
                if(err) {
                    self.logger.error("Cannot retrieve current ipAddress!");
                } else {
                    self.commandRouter.sharedVars.set('ipAddress',status.ipv4_address);
                }
            });
        } else {
            self.commandRouter.sharedVars.set('ipAddress',status.ipv4_address);
        }
    });
}
