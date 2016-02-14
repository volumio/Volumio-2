'use strict';

var libQ = require('kew');
var spawn = require('child_process').spawn;
var Volume = {};
Volume.vol = null;
Volume.mute = null;
var math = require('mathjs');

module.exports = CoreVolumeController;
function CoreVolumeController(commandRouter) {
	// This fixed variable will let us refer to 'this' object at deeper scopes
	var self = this;

	// Save a reference to the parent commandRouter
	self.commandRouter = commandRouter;

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

	var reDefaultDevice = /Simple mixer control \'([a-z0-9 -]+)\',[0-9]+/i;
	var defaultDeviceCache = null;
	var defaultDevice = function (cb) {
		if (defaultDeviceCache === null) {
			amixer([], function (err, data) {
				if (err) {
					cb(err);
				} else {
					var res = reDefaultDevice.exec(data);
					if (res === null) {
						cb(new Error('Alsa Mixer Error: failed to parse output'));
					} else {
						defaultDeviceCache = res[1];
						cb(null, defaultDeviceCache);
					}
				}
			});
		} else {
			cb(null, defaultDeviceCache);
		}
	};

	var reInfo = /[a-z][a-z ]*\: Playback [0-9-]+ \[([0-9]+)\%\] (?:[[0-9\.-]+dB\] )?\[(on|off)\]/i;
	var getInfo = function (cb) {
		defaultDevice(function (err, dev) {
			if (err) {
				cb(err);
			} else {
				amixer(['get', dev], function (err, data) {
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
		});
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
		defaultDevice(function (err, dev) {
			if (err) {
				cb(err);
			} else {
				amixer(['set', dev, val + '%'], function (err) {
					cb(err);
				});
			}
		});
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
		amixer(['set', 'PCM', (val ? 'mute' : 'unmute')], function (err) {
			cb(err);
		});
	};
}
// Public methods -----------------------------------------------------------------------------------
CoreVolumeController.prototype.alsavolume = function (VolumeInteger) {
	var self = this;
	self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'VolumeController::SetAlsaVolume' + VolumeInteger);

	switch (VolumeInteger) {
		case 'mute':
			//Mute or Unmute, depending on state
			self.getMuted(function (err, mute) {
				if (mute == false) {
					self.getVolume(function (err, vol) {
						self.setMuted(true, function (err) {
							self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'VolumeController::Muted ');
							Volume.vol = 0;
							Volume.mute = true;
							self.commandRouter.volumioupdatevolume(Volume);
						});
					});
				} else if (mute == true) {
					self.setMuted(false, function (err) {
						self.getVolume(function (err, vol) {
							self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'VolumeController::UnMuted ');
							Volume.vol = 0;
							Volume.mute = false;
							self.commandRouter.volumioupdatevolume(Volume);
						});
					});
				}
			});
			break;
		case 'unmute':
			//UnMute
			self.setMuted(false, function (err) {
				self.getVolume(function (err, vol) {

					self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'VolumeController::UnMuted ');
					Volume.vol = Math.round(math.log(VolumeInteger, 100) * 100);
					Volume.mute = false;
					self.commandRouter.volumioupdatevolume(Volume);
				});
			});
			break;
		case '+':
			//Incrase Volume by one (TEST ONLY FUNCTION - IN PRODUCTION USE A NUMERIC VALUE INSTEAD)
			self.setMuted(false, function (err) {
				self.getVolume(function (err, vol) {
					self.setVolume(vol + 1, function (err) {
						Volume.vol = Math.round(math.log(VolumeInteger, 100) * 100);
						Volume.mute = false;
						self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'VolumeController::Volume ' + vol);
						self.commandRouter.volumioupdatevolume(Volume);

					});
				});
			});
			break;
		case '-':
			//Decrase Volume by one (TEST ONLY FUNCTION - IN PRODUCTION USE A NUMERIC VALUE INSTEAD)
			this.getVolume(function (err, vol) {
				self.setVolume(vol - 1, function (err) {
					self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'VolumeController::Volume ' + vol);
					Volume.vol = Math.round(math.log(VolumeInteger, 100) * 100);
					Volume.mute = false;
					self.commandRouter.volumioupdatevolume(Volume);
				});
			});
			break;
		default:
			// Set the Volume with numeric value 0-100
			self.setMuted(false, function (err) {
				self.setVolume(VolumeInteger, function (err) {
					self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'VolumeController::Volume ' + VolumeInteger);
					//Log Volume Control
					Volume.vol = VolumeInteger;
					Volume.mute = false;
					self.commandRouter.volumioupdatevolume(Volume);
				});
			});
	}
};

CoreVolumeController.prototype.retrievevolume = function () {
	var self = this;

	var defer = libQ.defer();

	this.getVolume(function (err, vol) {
		self.getMuted(function (err, mute) {
			self.commandRouter.pushConsoleMessage('[' + Date.now() + '] ' + 'VolumeController:: Volume=' + vol + ' Mute =' + mute);
			//Log Volume Control
			Volume.vol = Math.round(Math.pow(100, (vol / 100)));
			Volume.mute = mute;
		});
	});
	defer.resolve({});
	return defer.promise;
};
