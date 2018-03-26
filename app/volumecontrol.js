'use strict';

var libQ = require('kew');
var spawn = require('child_process').spawn;
var execSync = require('child_process').execSync;
var Volume = {};
Volume.vol = null;
Volume.mute = null;


var device = '';
var mixer = '';
var maxvolume = '';
var volumecurve = '';
var volumesteps = '';
var currentvolume = '';
var currentmute = false;
var premutevolume = '';
var mixertype = '';
var devicename = '';
var volumescript = {'enabled':false, 'setvolumescript':'', 'getvolumescript':''};

module.exports = CoreVolumeController;
function CoreVolumeController(commandRouter) {
	// This fixed variable will let us refer to 'this' object at deeper scopes
	var self = this;

	// Save a reference to the parent commandRouter
	self.commandRouter = commandRouter;
	self.logger = self.commandRouter.logger;


	device = this.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'getConfigParam', 'outputdevice');
	if (device === 'softvolume') {
		device = this.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'getConfigParam', 'softvolumenumber');
		devicename = 'softvolume';
	} else {
        if (device.indexOf(',') >= 0) {
            device = device.charAt(0);
        }
		var cards = this.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'getAlsaCards', '');
		if ((cards[device] != undefined) && (cards[device].name != undefined)) {
			devicename = cards[device].name;
		}

	}
	var mixerdev = this.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'getConfigParam', 'mixer');

    if (mixerdev.indexOf(',') >= 0) {
    	var mixerarr = mixerdev.split(',');
        mixer = mixerarr[0]+','+mixerarr[1];
    } else {
        mixer = '"'+mixerdev+'"';
	}
	maxvolume = this.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'getConfigParam', 'volumemax');
	volumecurve = this.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'getConfigParam', 'volumecurvemode');
	volumesteps = this.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'getConfigParam', 'volumesteps');
	mixertype = this.commandRouter.executeOnPlugin('audio_interface', 'alsa_controller', 'getConfigParam', 'mixer_type');


	var amixer = function (args, cb) {

		var ret = '';
		var err = null;
		var p = spawn('amixer', args);

		p.stdout.on('data', function (data) {
			ret += data;
		});

		p.stderr.on('data', function (data) {
			err = new Error('Alsa Mixer Error: ' + data);
		});

		p.on('close', function () {
			cb(err, ret.trim());
		});

	};

	var reInfo = /[a-z][a-z ]*\: Playback [0-9-]+ \[([0-9]+)\%\] (?:[[0-9\.-]+dB\] )?\[(on|off)\]/i;
	var getInfo = function (cb) {
        if (volumescript.enabled) {
            try {
                var scriptvolume = execSync('/bin/sh ' + volumescript.getvolumescript, { uid: 1000, gid: 1000, encoding: 'utf8'});
                self.logger.info('External Volume: ' + scriptvolume);
                Volume.mute = false;
                if (volumescript.mapTo100 != undefined && volumescript.maxVol != undefined && volumescript.mapTo100) {
                    Volume.vol = parseInt((scriptvolume*100)/volumescript.maxVol);
                } else {
                    Volume.vol = scriptvolume;
				}
                if (volumescript.getmutescript != undefined && volumescript.getmutescript.length > 0) {
                    var scriptmute = execSync('/bin/sh ' + volumescript.getmutescript, { uid: 1000, gid: 1000, encoding: 'utf8'});
                    self.logger.info('External Volume: ' + scriptmute)
                    if (parseInt(scriptmute) === 1) {
                        Volume.mute = true;
                    }
                }
                cb(null, {
                    volume: Volume.vol,
                    muted: Volume.mute
                });
            } catch(e) {
                self.logger.info('Cannot get Volume with script: '+e);
                cb(new Error('Cannot execute Volume script'));
            }
        } else {
            if (volumecurve === 'logarithmic') {
                amixer(['-M', 'get', '-c', device, mixer], function (err, data) {
                    if (err) {
                        cb(err);
                    } else {
                        var res = reInfo.exec(data);
                        if (res === null) {
                            cb(new Error('Alsa Mixer Error: failed to parse output'));
                        } else {
                            cb(null, {
                                volume: parseInt(res[1], 10),
                                muted: (res[2] == 'off')
                            });
                        }
                    }
                });

            } else {
                amixer(['get', '-c', device, mixer], function (err, data) {
                    if (err) {
                        cb(err);
                    } else {
                        var res = reInfo.exec(data);
                        if (res === null) {
                            cb(new Error('Alsa Mixer Error: failed to parse output'));
                        } else {
                            cb(null, {
                                volume: parseInt(res[1], 10),
                                muted: (res[2] == 'off')
                            });
                        }
                    }
                });
            }
        }
	};

	self.getVolume = function (cb) {
            getInfo(function (err, obj) {
                if (err) {
                    cb(err);
                } else {
                    cb(null, obj.volume);
                }
            });
	};

	self.setVolume = function (val, cb) {
		if (volumescript.enabled) {
			try {
				if (volumescript.minVol != undefined && val < volumescript.minVol) {
					val = volumescript.minVol;
				}

                if (volumescript.mapTo100 != undefined && volumescript.maxVol != undefined && volumescript.mapTo100) {
                    var cmd = '/bin/sh ' + volumescript.setvolumescript + ' ' + parseInt(val*(volumescript.maxVol/100));
                } else {
                    if (volumescript.maxVol != undefined && val > volumescript.maxVol) {
                        val = volumescript.maxVol;
                    }
                    var cmd = '/bin/sh ' + volumescript.setvolumescript + ' ' + val;
				}

				self.logger.info('Volume script ' + cmd)
                Volume.mute = false;
                if (volumescript.setmutescript != undefined && volumescript.setmutescript.length > 0) {
                	if (val === 0) {
                        Volume.mute = true;
                        var scriptmute = execSync('/bin/sh ' + volumescript.setmutescript + ' 1', { uid: 1000, gid: 1000, encoding: 'utf8'});
					} else {
                        execSync(cmd, { uid: 1000, gid: 1000, encoding: 'utf8', tty:'pts/1'});
                        var scriptmute = execSync('/bin/sh ' + volumescript.setmutescript + ' 0', { uid: 1000, gid: 1000, encoding: 'utf8'});
					}
                    self.logger.info('External Volume: ' + scriptmute)
                }
                Volume.vol = parseInt(val);
                currentvolume = parseInt(val);
                self.commandRouter.volumioupdatevolume(Volume);
			} catch(e) {
                self.logger.info('Cannot set Volume with script: '+e);
			}
		} else {
            //console.log('amixer -M set -c '+device + ' '+ mixer + ' '+val+'%')
            if (volumecurve === 'logarithmic') {
                amixer(['-M', 'set', '-c', device, mixer, val + '%'], function (err) {
                    console.log(err)
                    cb(err);
                });
                if (devicename == 'PianoDACPlus'  || devicename == 'Allo Piano 2.1' || devicename == 'PianoDACPlus multicodec-0') {
                    amixer(['-M', 'set', '-c', device, 'Subwoofer', val + '%'], function (err) {

                    });
                }
            } else {
                amixer(['set', '-c', device, mixer, val + '%'], function (err) {
                    cb(err);
                });
                if (devicename == 'PianoDACPlus'  || devicename == 'Allo Piano 2.1' || devicename == 'PianoDACPlus multicodec-0') {
                    amixer(['set', '-c', device, 'Subwoofer', val + '%'], function (err) {
                       
                    });
                }
            }
		}

	};

	self.getMuted = function (cb) {
		getInfo(function (err, obj) {
			if (err) {
				cb(err);
			} else {
				cb(null, obj.muted);
			}
		});
	};

	self.setMuted = function (val, cb) {
		amixer(['set', '-c', device, mixer , (val ? 'mute' : 'unmute')], function (err) {
			cb(err);
		});
	};
}


CoreVolumeController.prototype.updateVolumeSettings = function (data) {
	var self = this;


	self.logger.info('Updating Volume Controller Parameters: Device: '+ data.device + ' Name: '+ data.name +' Mixer: '+ data.mixer + ' Max Vol: ' + data.maxvolume + ' Vol Curve; ' + data.volumecurve + ' Vol Steps: ' + data.volumesteps);

	device = data.device;
    if (device.indexOf(',') >= 0) {
        device = device.charAt(0);
    }
	mixer = '"'+data.mixer+'"';
    if (data.mixer.indexOf(',') >= 0) {
        var mixerarr = data.mixer.split(',');
        mixer = mixerarr[0]+','+mixerarr[1];
    } else {
        mixer = '"'+data.mixer+'"';
    }
	maxvolume = data.maxvolume;
	volumecurve = data.volumecurve;
	volumesteps = data.volumesteps;
	mixertype = data.mixertype
	devicename = data.name;
}

CoreVolumeController.prototype.updateVolumeScript = function (data) {
    var self = this;

    if (data.setvolumescript != undefined && data.getvolumescript != undefined) {
        self.logger.info('Updating Volume script: '+ JSON.stringify(data));
        volumescript = data;
	}
}


// Public methods -----------------------------------------------------------------------------------
CoreVolumeController.prototype.alsavolume = function (VolumeInteger) {
	var self = this;
	var defer = libQ.defer();
	self.logger.info('VolumeController::SetAlsaVolume' + VolumeInteger);

	switch (VolumeInteger) {
		case 'mute':
			//Mute or Unmute, depending on state
			self.getVolume(function (err, vol) {
				if (vol == null) {
					vol =  currentvolume
				}
				currentmute = true;
				premutevolume = vol;

				self.setVolume(0, function (err) {
					Volume.vol = 0
					Volume.mute = true;
                    defer.resolve(Volume)
				});
			});
			break;
		case 'unmute':
			//UnMute
					currentmute = false;
					self.setVolume(premutevolume, function (err) {
						self.logger.info('VolumeController::Volume ' + VolumeInteger);
						//Log Volume Control
						Volume.vol = premutevolume;
						Volume.mute = false;
						currentvolume = premutevolume;
                        defer.resolve(Volume)

					});
			break;
		case 'toggle':
			// mute or unmute, depending on cases
			if (Volume.mute){
				self.alsavolume('unmute');
			}
			else {
				self.alsavolume('mute');
			}
			break;
		case '+':
			//Incrase Volume by one (TEST ONLY FUNCTION - IN PRODUCTION USE A NUMERIC VALUE INSTEAD)
			self.setMuted(false, function (err) {
				self.getVolume(function (err, vol) {
					if (vol == null) {
						vol =  currentvolume;
					}
					VolumeInteger = Number(vol)+Number(volumesteps);
					if (VolumeInteger > 100){
						VolumeInteger = 100;
					}
					if (VolumeInteger > maxvolume){
						VolumeInteger = maxvolume;
					}
					if (mixertype === 'None') {
						VolumeInteger = 100;
					}
					self.setVolume(VolumeInteger, function (err) {
						Volume.vol = VolumeInteger
						Volume.mute = false;
                        currentvolume = VolumeInteger;
						self.logger.info('VolumeController::Volume ' + vol);
                        defer.resolve(Volume)

					});
				});
			});
			break;
		case '-':
			//Decrase Volume by one (TEST ONLY FUNCTION - IN PRODUCTION USE A NUMERIC VALUE INSTEAD)
			self.getVolume(function (err, vol) {
				if (vol == null) {
					vol =  currentvolume
				}
				VolumeInteger = Number(vol)-Number(volumesteps);
				if (VolumeInteger < 0){
					VolumeInteger = 0;
				}
				if (VolumeInteger > maxvolume){
					VolumeInteger = maxvolume;
				}
				if (mixertype === 'None') {
					VolumeInteger = 100;
				}
				self.setVolume(VolumeInteger, function (err) {
					self.logger.info('VolumeController::Volume ' + vol);
					Volume.vol = VolumeInteger
					Volume.mute = false;
                    currentvolume = VolumeInteger;
                    defer.resolve(Volume)
				});
			});
			break;
		default:
			// Set the Volume with numeric value 0-100
			if (VolumeInteger < 0){
				VolumeInteger = 0;
			}
			if (VolumeInteger > 100){
				VolumeInteger = 100;
			}
			if (VolumeInteger > maxvolume){
				VolumeInteger = maxvolume;
			}
			if (mixertype === 'None') {
				VolumeInteger = 100;
			}
				self.setVolume(VolumeInteger, function (err) {
					self.logger.info('VolumeController::Volume ' + VolumeInteger);
					//Log Volume Control
					Volume.vol = VolumeInteger;
					Volume.mute = false;
					currentvolume = VolumeInteger;
					defer.resolve(Volume)
			});
	}

	return defer.promise
};

CoreVolumeController.prototype.retrievevolume = function () {
	var self = this;
	this.getVolume(function (err, vol) {
		self.getMuted(function (err, mute) {
			self.logger.info('VolumeController:: Volume=' + vol + ' Mute =' + mute);
			//Log Volume Control
			 //Log Volume Control
                        if (vol == null) {
                        vol = currentvolume,
                        mute = currentmute
                        } else {
                        currentvolume = vol
                        }
			Volume.vol = vol;
			Volume.mute = mute;
			if (mixertype === 'None') {
				Volume.vol = 100;
			}
			return libQ.resolve(Volume)
				.then(function (Volume) {
					self.commandRouter.volumioupdatevolume(Volume);
				});

		});
	});
};

