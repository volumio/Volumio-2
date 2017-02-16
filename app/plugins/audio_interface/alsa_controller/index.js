'use strict';

var io = require('socket.io-client');
var fs = require('fs-extra');
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;
var libQ = require('kew');
var libFsExtra = require('fs-extra');
var spawn = require('child_process').spawn;

// Define the ControllerAlsa class
module.exports = ControllerAlsa;
function ControllerAlsa(context) {
	this.context = context;
	this.commandRouter = this.context.coreCommand;
	this.logger = this.context.logger;
	this.configManager = this.context.configManager;
}

ControllerAlsa.prototype.onVolumioStart = function () {
	var self = this;

	var configFile = this.commandRouter.pluginManager.getConfigurationFile(this.context, 'config.json');

	this.config = new (require('v-conf'))();
	this.config.loadFile(configFile);

	var volumeval = this.config.get('volumestart');


	var socketURL = 'http://localhost:3000';
	var options = {
		transports: ['websocket'],
		'force new connection': true
	};

	var client1 = io.connect(socketURL, options);


	if (volumeval != 'disabled') {
		setTimeout(function () {
			exec('/volumio/app/plugins/system_controller/volumio_command_line_client/volumio.sh volume ' + volumeval, {uid: 1000, gid: 1000, encoding: 'utf8'}, function (error, stdout, stderr) {
				if (error) {
					self.logger.error('Cannot set startup volume: ' + error);
				} else {
					self.logger.info("Setting volume on startup at " + volumeval);
				}
			});
		}, 5000);
	}

	if (this.config.has('outputdevice') == false) {
		this.config.addConfigValue('outputdevice', 'string', '0');
		this.updateVolumeSettings();
	}
	if (this.config.has('mixer') == false) {
		var value = this.config.get('outputdevice');
		this.setDefaultMixer(value);
		this.updateVolumeSettings();
	}

	if (this.config.has('volumesteps') == false) {
		this.config.addConfigValue('volumesteps', 'string', '10');
		this.updateVolumeSettings();
	}

	this.logger.debug("Creating shared var alsa.outputdevice");
	this.commandRouter.sharedVars.addConfigValue('alsa.outputdevice', 'string', this.config.get('outputdevice'));
	this.commandRouter.sharedVars.addConfigValue('alsa.outputdevicemixer', 'string', this.config.get('mixer'));
	this.commandRouter.sharedVars.registerCallback('alsa.outputdevice', this.outputDeviceCallback.bind(this));

	self.checkMixer();

	return libQ.resolve();
};

ControllerAlsa.prototype.getUIConfig = function () {
	var self = this;

	var defer = libQ.defer();

	var lang_code = this.commandRouter.sharedVars.get('language_code');

	self.commandRouter.i18nJson(__dirname+'/../../../i18n/strings_'+lang_code+'.json',
		__dirname+'/../../../i18n/strings_en.json',
		__dirname + '/UIConfig.json')
		.then(function(uiconf)
		{


			var value;
			var devicevalue;

			var cards = self.getAlsaCards();

			value = self.config.get('outputdevice');
			if (value == undefined){
				value = 0;
			} else if (value == 'softvolume') {
				value = self.config.get('softvolumenumber');
			}
			var cardnum = value;

			self.configManager.setUIConfigParam(uiconf, 'sections[0].content[0].value.value', value);
			var outdevicename = self.config.get('outputdevicename');
			if (outdevicename) {
				self.configManager.setUIConfigParam(uiconf, 'sections[0].content[0].value.label', outdevicename);
			} else {
				outdevicename = self.getLabelForSelectedCard(cards, value);
				self.configManager.setUIConfigParam(uiconf, 'sections[0].content[0].value.label', outdevicename);
			}


			for (var i in cards) {
				if (cards[i].name === 'Audio Jack') {
					self.configManager.pushUIConfigParam(uiconf, 'sections[0].content[0].options', {
						value: cards[i].id,
						label: 'Audio Jack'
					});
					self.configManager.pushUIConfigParam(uiconf, 'sections[0].content[0].options', {
						value: cards[i].id,
						label: 'HDMI Out'
					});
				} else {
					if (cards[i].id == '5') {
						cards[i].name = 'USB: '+cards[i].name;
					}
					self.configManager.pushUIConfigParam(uiconf, 'sections[0].content[0].options', {
						value: cards[i].id,
						label: cards[i].name
					});
				}
			}

			var i2soptions = self.commandRouter.executeOnPlugin('system_controller', 'i2s_dacs', 'getI2sOptions');
			var i2sstatus = self.commandRouter.executeOnPlugin('system_controller', 'i2s_dacs', 'getI2sStatus');

			if(i2soptions.length > 0){
				if(i2sstatus.enabled){
					self.configManager.setUIConfigParam(uiconf, 'sections[0].content[1].value', i2sstatus.enabled);
					self.configManager.setUIConfigParam(uiconf, 'sections[0].content[2].value', {
						value: i2sstatus.id,
						label: i2sstatus.name
					});

				} else {
					self.configManager.setUIConfigParam(uiconf, 'sections[0].content[1].value', false);
					self.configManager.setUIConfigParam(uiconf, 'sections[0].content[2].value', {
						value: i2soptions[0].value,
						label: i2soptions[0].label
					});
				}

				self.configManager.setUIConfigParam(uiconf, 'sections[0].content[1].id', 'i2s');
				self.configManager.pushUIConfigParam(uiconf, 'sections[0].saveButton.data', 'i2s');
				self.configManager.pushUIConfigParam(uiconf, 'sections[0].saveButton.data', 'i2sid');
				self.configManager.setUIConfigParam(uiconf, 'sections[0].content[1].label', 'I2S DAC');
				self.configManager.setUIConfigParam(uiconf, 'sections[0].content[1].element', 'switch');
				self.configManager.setUIConfigParam(uiconf, 'sections[0].content[2].id', 'i2sid');
				self.configManager.setUIConfigParam(uiconf, 'sections[0].content[2].element', 'select');
				self.configManager.setUIConfigParam(uiconf, 'sections[0].content[2].label', 'DAC Model');

				for(var i in i2soptions) {
					self.configManager.pushUIConfigParam(uiconf, 'sections[0].content[2].options', {
						value: i2soptions[i].value,
						label: i2soptions[i].label
					});
				}
			}

			var mixers = self.getMixerControls(value);
			var activemixer = self.config.get('mixer');
			var activemixer_type = self.config.get('mixer_type');


			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[0].element', 'select');
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[0].label', self.commandRouter.getI18nString('PLAYBACK_OPTIONS.MIXER_TYPE'));
			if (activemixer_type == 'None') {
				var activemixer_type_lang = self.commandRouter.getI18nString('COMMON.NONE');
			} else if (activemixer_type == 'Software'){
				var activemixer_type_lang = self.commandRouter.getI18nString('PLAYBACK_OPTIONS.SOFTWARE');
			} else if (activemixer_type == 'Hardware'){
				var activemixer_type_lang = self.commandRouter.getI18nString('PLAYBACK_OPTIONS.HARDWARE');
			} else {
				var activemixer_type_lang = activemixer_type;
			}
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[0].value', {
				value: activemixer_type,
				label: activemixer_type_lang
			});

			if ((typeof mixers != "undefined") || ( mixers != null )) {
				if ((mixers.length > 1 ) && (mixers[0] == 'SoftMaster' || activemixer == 'SoftMaster' )) {

						self.configManager.pushUIConfigParam(uiconf, 'sections[3].content[0].options', {
							value: 'Hardware',
							label: self.commandRouter.getI18nString('PLAYBACK_OPTIONS.HARDWARE')
						});

				} else if ((mixers.length > 0 ) && (mixers[0] != 'SoftMaster') && (activemixer != 'SoftMaster' )) {
					self.configManager.pushUIConfigParam(uiconf, 'sections[3].content[0].options', {
					value: 'Hardware',
					label: self.commandRouter.getI18nString('PLAYBACK_OPTIONS.HARDWARE')
					});
				}

			}
			self.configManager.pushUIConfigParam(uiconf, 'sections[3].content[0].options', {
				value: 'Software',
				label: self.commandRouter.getI18nString('PLAYBACK_OPTIONS.SOFTWARE')
			});

			self.configManager.pushUIConfigParam(uiconf, 'sections[3].content[0].options', {
				value: 'None',
				label: self.commandRouter.getI18nString('COMMON.NONE')
			});

			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[1].id', 'mixer');
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[1].element', 'select');
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[1].label', self.commandRouter.getI18nString('PLAYBACK_OPTIONS.MIXER_CONTROL_NAME'));


			if (activemixer_type === 'Hardware') {
			if ((typeof mixers != "undefined") || ( mixers != null ) || (mixers.length > 0)) {
				self.configManager.pushUIConfigParam(uiconf, 'sections[3].saveButton.data', 'mixer');
				if (activemixer){
					self.configManager.setUIConfigParam(uiconf, 'sections[3].content[1].value', {
						value: activemixer,
						label: activemixer
					});
				} else {
					self.configManager.setUIConfigParam(uiconf, 'sections[3].content[1].value', {
						value: mixers[0],
						label: mixers[0]
					});
				}
				var index = mixers.indexOf('SoftMaster');
				if (index > -1) {
					mixers.splice(index, 1);
				}
				for(var i in mixers) {
					self.configManager.pushUIConfigParam(uiconf, 'sections[3].content[1].options', {
						value: mixers[i],
						label: mixers[i]
					});
				}
			}

			} else if (activemixer_type === 'Software') {
				self.configManager.setUIConfigParam(uiconf, 'sections[3].content[1].value', {
					value: "SoftMaster",
					label: self.commandRouter.getI18nString('PLAYBACK_OPTIONS.SOFTVOL')
				});
				self.configManager.pushUIConfigParam(uiconf, 'sections[3].content[1].options', {
					value: "SoftMaster",
					label: self.commandRouter.getI18nString('PLAYBACK_OPTIONS.SOFTVOL')
				});
			} else if (activemixer_type === 'None'){
				self.configManager.setUIConfigParam(uiconf, 'sections[3].content[1].value', {
					value: "None",
					label: self.commandRouter.getI18nString('COMMON.NONE')
				});
				self.configManager.pushUIConfigParam(uiconf, 'sections[3].content[1].options', {
					value: "None",
					label: self.commandRouter.getI18nString('COMMON.NONE')
				});

			}

			value = self.getAdditionalConf('music_service', 'mpd', 'dop');
			self.configManager.setUIConfigParam(uiconf, 'sections[2].content[0].value', value);
			self.configManager.setUIConfigParam(uiconf, 'sections[2].content[0].value.label', self.getLabelForSelect(self.configManager.getValue(uiconf, 'sections[2].content[0].options'), value));

			value = self.getAdditionalConf('music_service', 'mpd', 'volume_normalization');
			self.configManager.setUIConfigParam(uiconf, 'sections[2].content[1].value', value);
			self.configManager.setUIConfigParam(uiconf, 'sections[2].content[1].value.label', self.getLabelForSelect(self.configManager.getValue(uiconf, 'sections[2].content[1].options'), value));

			value = self.getAdditionalConf('music_service', 'mpd', 'audio_buffer_size');
			self.configManager.setUIConfigParam(uiconf, 'sections[2].content[2].value.value', value);
			self.configManager.setUIConfigParam(uiconf, 'sections[2].content[2].value.label', self.getLabelForSelect(self.configManager.getValue(uiconf, 'sections[2].content[2].options'), value));

			value = self.getAdditionalConf('music_service', 'mpd', 'buffer_before_play');
			self.configManager.setUIConfigParam(uiconf, 'sections[2].content[3].value.value', value);
			self.configManager.setUIConfigParam(uiconf, 'sections[2].content[3].value.label', self.getLabelForSelect(self.configManager.getValue(uiconf, 'sections[2].content[3].options'), value));

			value = self.getAdditionalConf('music_service', 'mpd', 'persistent_queue');
			if (value == undefined) {
				value = true
			}
			self.configManager.setUIConfigParam(uiconf, 'sections[2].content[4].value', value);
			self.configManager.setUIConfigParam(uiconf, 'sections[2].content[4].value.label', self.getLabelForSelect(self.configManager.getValue(uiconf, 'sections[2].content[4].options'), value));

			value = self.config.get('volumestart');
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[2].value.value', value);
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[2].value.label', self.getLabelForSelect(self.configManager.getValue(uiconf, 'sections[3].content[2].options'), value));

			value = self.config.get('volumemax');
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[3].value.value', value);
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[3].value.label', self.getLabelForSelect(self.configManager.getValue(uiconf, 'sections[3].content[3].options'), value));

			value = self.config.get('volumesteps');
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[4].value.value', value);
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[4].value.label', self.getLabelForSelect(self.configManager.getValue(uiconf, 'sections[3].content[4].options'), value));

			value = self.config.get('volumecurvemode');
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[5].value.value', value);
			self.configManager.setUIConfigParam(uiconf, 'sections[3].content[5].value.label', self.getLabelForSelect(self.configManager.getValue(uiconf, 'sections[3].content[5].options'), value));

			var  payload = {"number":cardnum,"name":outdevicename}

			var dspoptions = self.getDSPDACOptions(payload);
			if (dspoptions && dspoptions.length > 0) {
				self.configManager.setUIConfigParam(uiconf, 'sections[1].label', outdevicename + ' ' + self.commandRouter.getI18nString('PLAYBACK_OPTIONS.ADVANCED_DAC_DSP_OPTIONS'));
				self.configManager.setUIConfigParam(uiconf, 'sections[1].hidden', false);
				for (var w = 0; w < dspoptions.length; w++) {
					self.configManager.pushUIConfigParam(uiconf, 'sections[1].saveButton.data', dspoptions[w].name);
					var dspconf = {id : dspoptions[w].name, element : 'select' , label:dspoptions[w].name , hidden:false, value :{value:dspoptions[w].value, label:dspoptions[w].value}, options: []}
					self.configManager.pushUIConfigParam(uiconf, 'sections[1].content', dspconf);
					if ((dspoptions[w].name == 'Subwoofer mode') && (dspoptions[w].value == '  2.0')) {
						uiconf.sections[1].content[0].hidden = true;
					}

					for (var r in dspoptions[w].options) {
						self.configManager.pushUIConfigParam(uiconf, 'sections[1].content['+w+'].options', {
							value:dspoptions[w].options[r],
							label:dspoptions[w].options[r]
						});
					}

				}
			}

			defer.resolve(uiconf);
		})
		.fail(function()
		{
			defer.reject(new Error());
		})

	return defer.promise
};



ControllerAlsa.prototype.saveDSPOptions = function (data) {
	var self = this;
	//console.log(data)

	var pre = '';
	var reboot = false;

	var value = self.config.get('outputdevice');
	if (value == undefined){
		value = 0;
	} else if (value == 'softvolume') {
		value = self.config.get('softvolumenumber');
	}


	var outdevicename = self.config.get('outputdevicename');
	if (outdevicename) {
	} else {
		outdevicename = self.getLabelForSelectedCard(cards, value);
	}

	if (outdevicename == 'Allo Piano 2.1') {
		var preraw = execSync("amixer get -c 1 'Subwoofer mode' | grep Item0", {encoding: 'utf8'});
		var preraw2 = preraw.split("'");
		pre = preraw2[1];
	}

	for(var i in data ) {
		//console.log(data[i])
		//console.log(i)
		//console.log("/usr/bin/amixer -c " + value + " set  '" + i + "' '" + data[i].value.replace('  ', ''))
		exec("/usr/bin/amixer -c " + value + " set '" + i + "' '" + data[i].value.replace('  ', '')+"'", {uid:1000, gid:1000},function(error, stdout, stderr) {
			if (error) {
				self.logger.info('ERROR Cannot set DSP ' + i + ' for card ' + value +': '+error);
			} else {
				self.logger.info('Successfully set DSP ' + i + ' for card ' + value );
				if ((outdevicename == 'Allo Piano 2.1') && (i == 'Subwoofer mode') && (pre != data[i].value.replace('  ', ''))) {

					var responseData = {
						title: self.commandRouter.getI18nString('PLAYBACK_OPTIONS.DSP_PROGRAM_ENABLED'),
						message: self.commandRouter.getI18nString('PLAYBACK_OPTIONS.DSP_PROGRAM_REBOOT'),
						size: 'lg',
						buttons: [
							{
								name: self.commandRouter.getI18nString('COMMON.RESTART'),
								class: 'btn btn-info',
								emit:'reboot',
								payload:''
							}
						]
					}

					self.commandRouter.broadcastMessage("openModal", responseData);

				}

			}
		});

	}

	self.commandRouter.pushToastMessage('success',self.commandRouter.getI18nString('PLAYBACK_OPTIONS.ADVANCED_DAC_DSP_OPTIONS'), self.commandRouter.getI18nString('PLAYBACK_OPTIONS.DSP_PROGRAM_ENABLED'));
}


ControllerAlsa.prototype.getDSPDACOptions = function (data) {
	var self = this;

	var dspdata = fs.readJsonSync(('/volumio/app/plugins/audio_interface/alsa_controller/dac_dsp.json'),  'utf8', {throws: false});
	var dspobject = {};
	var dspcontrols = [];

	for (var e = 0; e < dspdata.cards.length; e++) {
		if (dspdata.cards[e].name === data.name) {


			try {

				var dsparray = execSync('amixer -c ' + data.number + ' scontents', {encoding: 'utf8'});


				var dspobj = dsparray.toString().split("Simple mixer control");

				for (var i in dspobj) {
					if (dspobj[i].indexOf("Items") >= 0) {
						var line = dspobj[i].split('\n');
						//console.log(line)
						var line2 = line[0].split(',')
						var dspspace = line2[0].replace(/'/g, "").toString();
						var dspname = dspspace.replace(" ", "");
						if (dspdata.cards[e].dsp_options.indexOf(dspname) > -1) {
							//console.log(dspname)
							var dspoptsarray = line[2].replace(/Items:/g, "").replace(" ", "").split("'").filter(function (val) {
								return val.length > 0;
							});
							//var dspoptsarray = dspoptraw;
							//console.log(dspoptsarray)
							var dspvalue = line[3].replace(/Item0:/g, "").replace(" ", "").replace(/\'/g, "");
							//console.log(dspvalue)
							dspcontrols.push({"name": dspname, "options": dspoptsarray, "value": dspvalue});
						}
					}
				}

			}
			catch (e) {

			}
		}
	}
	return dspcontrols
}

ControllerAlsa.prototype.saveAlsaOptions = function (data) {

	//console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' + JSON.stringify(data));
	if (data.output_device.label != undefined) {
		data.output_device.label = data.output_device.label.replace('USB: ', '');
	}
	//console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' + JSON.stringify(data));

	var self = this;

	var defer = libQ.defer();

	var i2sstatus = self.commandRouter.executeOnPlugin('system_controller', 'i2s_dacs', 'getI2sStatus');

	var OutputDeviceNumber = data.output_device.value;



	if (data.i2s){
		var I2SNumber = self.commandRouter.executeOnPlugin('system_controller', 'i2s_dacs', 'getI2SNumber', data.i2sid.label);
		if (i2sstatus.name != data.i2sid.label) {
			self.logger.info('Enabling I2S DAC: ' + data.i2sid.label);
			var response = self.commandRouter.executeOnPlugin('system_controller', 'i2s_dacs', 'enableI2SDAC', data.i2sid.label);
			if (response != undefined) {
				response.then(function (result) {
					if (result.reboot == 'yes') {
					var responseData = {
						title: self.commandRouter.getI18nString('PLAYBACK_OPTIONS.I2S_DAC_ACTIVATED'),
						message: data.i2sid.label+ ' '+ self.commandRouter.getI18nString('PLAYBACK_OPTIONS.I2S_DAC_ACTIVATED_MESSAGE'),
						size: 'lg',
						buttons: [
							{
								name: self.commandRouter.getI18nString('COMMON.RESTART'),
								class: 'btn btn-info',
								emit:'reboot',
								payload:''
							}
						]
					}

					self.commandRouter.broadcastMessage("openModal", responseData);
				}
				})
					.fail(function () {
						self.logger.log('Error Setting i2s DAC')
					});
			}
			this.config.set('outputdevicename', data.i2sid.label);
			OutputDeviceNumber = I2SNumber;


		}

	} else {

		if (data.output_device.label === 'HDMI Out') {
			if (this.config.has('outputdevicename') == false) {
				this.config.addConfigValue('outputdevicename', 'string', 'HDMI Out');
			} else {
				this.config.set('outputdevicename', 'HDMI Out');
			}
			self.enablePiHDMI();
		} else if (data.output_device.label === 'Audio Jack') {
			if (this.config.has('outputdevicename') == false) {
				this.config.addConfigValue('outputdevicename', 'string', 'Audio Jack');
			} else {
				this.config.set('outputdevicename', 'Audio Jack');
			}
			self.enablePiJack();
		} else {
			if (this.config.has('outputdevicename') == false) {
				this.config.addConfigValue('outputdevicename', 'string', data.output_device.label);
			} else {
				this.config.set('outputdevicename', data.output_device.label);
			}
		}

		if (i2sstatus.enabled){
			self.logger.info('Disabling I2S DAC: ');
			self.commandRouter.executeOnPlugin('system_controller', 'i2s_dacs', 'disableI2SDAC', '');
			this.config.set('outputdevicename', 'Audio Jack');
			OutputDeviceNumber = "0";
			self.enablePiJack();
			/*
			var responseData = {
				title: self.commandRouter.getI18nString('PLAYBACK_OPTIONS.I2S_DAC_DEACTIVATED'),
				message: data.i2sid.label+ ' ' + self.commandRouter.getI18nString('PLAYBACK_OPTIONS.I2S_DAC_DEACTIVATED_MESSAGE'),
				size: 'lg',
				buttons: [
					{
						name: self.commandRouter.getI18nString('COMMON.RESTART'),
						class: 'btn btn-info',
						emit:'reboot',
						payload:''
					}
				]
			}

			self.commandRouter.broadcastMessage("openModal", responseData);
			 */
		}
	}

	self.commandRouter.sharedVars.set('alsa.outputdevice', OutputDeviceNumber);
	self.setDefaultMixer(OutputDeviceNumber);

	var respconfig = self.getUIConfig();

	respconfig.then(function(config)
	{
		self.commandRouter.broadcastMessage('pushUiConfig', config);
	});

	return defer.promise;

};

ControllerAlsa.prototype.saveVolumeOptions = function (data) {
	var self = this;

	var defer = libQ.defer();

	self.setConfigParam({key: 'volumestart', value: data.volumestart.value});
	self.setConfigParam({key: 'volumemax', value: data.volumemax.value});
	self.setConfigParam({key: 'volumecurvemode', value: data.volumecurvemode.value});
	self.setConfigParam({key: 'volumesteps', value: data.volumesteps.value});
	if (data.mixer_type.value === 'Hardware') {
	if (data.mixer.value == 'SoftMaster'){
		var value = self.config.get('outputdevice');
		if (value == undefined){
			value = 0;
		} else if (value == 'softvolume') {
			value = self.config.get('softvolumenumber');
		}
		var mixers = self.getMixerControls(value);
		var index = mixers.indexOf('SoftMaster');
		if (index > -1) {
			mixers.splice(index, 1);
			data.mixer.value = mixers[0];
		}
	}
	self.setConfigParam({key: 'mixer', value: data.mixer.value});
	} else if (data.mixer_type.value === 'Software') {
		var outdevice = self.config.get('outputdevice');
		self.enableSoftMixer(outdevice);
	} else if (data.mixer_type.value === 'None'){
		self.setConfigParam({key: 'mixer', value: ''});
		var outdevice = self.config.get('softvolumenumber');
		self.commandRouter.sharedVars.set('alsa.outputdevice', outdevice);
		self.disableSoftMixer(outdevice);
	}
	self.setConfigParam({key: 'mixer_type', value: data.mixer_type.value});

	self.logger.info('Volume configurations have been set');
	self.commandRouter.sharedVars.set('alsa.outputdevicemixer', data.mixer.value);

	self.commandRouter.pushToastMessage('success',self.commandRouter.getI18nString('PLAYBACK_OPTIONS.MIXER_CONTROLS'), self.commandRouter.getI18nString('PLAYBACK_OPTIONS.MIXER_CONTROLS_UPDATE'));

	defer.resolve({});
	this.updateVolumeSettings();

	var respconfig = self.getUIConfig();

	respconfig.then(function(config)
	{
		self.commandRouter.broadcastMessage('pushUiConfig', config);
	});

	return defer.promise;

};

ControllerAlsa.prototype.outputDeviceCallback = function (value) {
	this.config.set('outputdevice', value);
};

ControllerAlsa.prototype.getConfigParam = function (key) {
	return this.config.get(key);
};

ControllerAlsa.prototype.setConfigParam = function (data) {
	this.config.set(data.key, data.value);
};


ControllerAlsa.prototype.getConfigurationFiles = function () {
	return ['config.json'];
};

ControllerAlsa.prototype.getAdditionalConf = function (type, controller, data) {
	var self = this;
	return self.commandRouter.executeOnPlugin(type, controller, 'getConfigParam', data);
};

ControllerAlsa.prototype.setAdditionalConf = function (type, controller, data) {
	var self = this;
	return self.commandRouter.executeOnPlugin(type, controller, 'setConfigParam', data);
};

ControllerAlsa.prototype.getLabelForSelectedCard = function (cards, key) {
	var self=this;
	var n = cards.length;
	for (var i = 0; i < n; i++) {
		if (cards[i].id == key)
			return cards[i].name;
	}

	return 'No Audio Device Available';
};

ControllerAlsa.prototype.getLabelForSelect = function (options, key) {
	var self=this;
	var n = options.length;
	for (var i = 0; i < n; i++) {
		if (options[i].value == key)
			return options[i].label;
	}

	return 'Error';
};

ControllerAlsa.prototype.getAlsaCards = function () {
	var self=this;
	var cards = [];

	var soundCardDir = '/proc/asound/';
	var idFile = '/id';
	var regex = /card(\d+)/;
	var carddata = fs.readJsonSync(('/volumio/app/plugins/audio_interface/alsa_controller/cards.json'),  'utf8', {throws: false});

	try {
		var soundFiles = fs.readdirSync(soundCardDir);



	for (var i = 0; i < soundFiles.length; i++) {
		var fileName = soundFiles[i];
		var matches = regex.exec(fileName);
		var idFileName = soundCardDir + fileName + idFile;
		if (matches && fs.existsSync(idFileName)) {
			var id = matches[1];
			var content = fs.readFileSync(idFileName);
			var rawname = content.toString().trim();
			var name = rawname;
			for (var n = 0; n < carddata.cards.length; n++){
				var cardname = carddata.cards[n].name.toString().trim();
				if (cardname === rawname){
					var name = carddata.cards[n].prettyname;
				}
			} cards.push({id: id, name: name});

		}
	}
	} catch (e) {
		var namestring = 'No Audio Device Available';
		cards.push({id: '', name: namestring});
	}

	return cards;
};

ControllerAlsa.prototype.getMixerControls  = function (device) {

	var mixers = [];
	var outdev = this.config.get('outputdevice');
	if (outdev == 'softvolume'){
		outdev = this.config.get('softvolumenumber');
	}
	try {
		var array = execSync('amixer -c '+ outdev +' scontents', { encoding: 'utf8' })
		var genmixers = array.toString().split("Simple mixer control");

		for (var i in genmixers) {
			if (genmixers[i].indexOf("Playback") >= 0) {
				var line = genmixers[i].split('\n');
				var line2 = line[0].split(',')
				var mixerspace = line2[0].replace(/'/g,"").toString();
				var mixer = mixerspace.replace(" ", "")
				mixers.push(mixer);
			}
		}
	} catch (e) {}
	return mixers
}

ControllerAlsa.prototype.setDefaultMixer  = function (device) {
	var self = this;


	var mixers = [];
	var currentcardname = '';
	var defaultmixer = '';
	var match = '';
	var mixertpye = '';
	var carddata = fs.readJsonSync(('/volumio/app/plugins/audio_interface/alsa_controller/cards.json'),  'utf8', {throws: false});
	var cards = self.getAlsaCards();
	var i2sstatus = self.commandRouter.executeOnPlugin('system_controller', 'i2s_dacs', 'getI2sStatus');


	for (var i in cards) {
		var devnum = device.toString();
		if ( devnum == cards[i].id) {
			currentcardname = cards[i].name;
		}
	}

	if (i2sstatus && i2sstatus.enabled){
		var cardname = i2sstatus.name;
		var mixer = self.commandRouter.executeOnPlugin('system_controller', 'i2s_dacs', 'getI2SMixer', cardname);
		if (mixer){
			defaultmixer = mixer;
			self.logger.info('Found match in i2s Card Database: setting mixer '+ defaultmixer + ' for card ' + cardname);
		}

	} else {
		for (var n = 0; n < carddata.cards.length; n++){
			var cardname = carddata.cards[n].prettyname.toString().trim();

			if (cardname == currentcardname){
				defaultmixer = carddata.cards[n].defaultmixer;
				self.logger.info('Found match in Cards Database: setting mixer '+ defaultmixer + ' for card ' + currentcardname);

			}
		}
	}
	if (defaultmixer) {
		this.mixertype = 'Hardware';
	} else {
		try {

			var array = execSync('amixer -c '+device+' scontents', { encoding: 'utf8' })
			var genmixers = array.toString().split("Simple mixer control");


			if (genmixers) {
				for (var i in genmixers) {
					if (genmixers[i].indexOf("Playback") >= 0) {
						var line = genmixers[i].split('\n');
						var line2 = line[0].split(',')
						var mixerspace = line2[0].replace(/'/g, "");
						var mixer = mixerspace.replace(" ", "");
						mixers.push(mixer);
					}
				}
				if (mixers[0] && mixers[0] != 'SoftMaster') {
					defaultmixer = mixers[0].toString()
					self.logger.info('Setting mixer ' + defaultmixer + ' for card ' + currentcardname);
					this.mixertype = 'Hardware';


				} else {
					self.logger.info('Device ' + device + ' does not have any Mixer Control Available, setting a softvol device');
					this.mixertype = 'None';
					//defaultmixer = 'SoftMaster';
					//self.enableSoftMixer(device);
				}
			}
		} catch (e) {}
	}
	if (this.config.has('mixer_type') == false) {
		this.config.addConfigValue('mixer_type', 'string', this.mixertype);
	} else {
		self.setConfigParam({key: 'mixer_type', value: this.mixertype});
	}
	if (this.config.has('mixer') == false) {
		this.config.addConfigValue('mixer', 'string', defaultmixer);
		this.updateVolumeSettings();
	} else {
		self.setConfigParam({key: 'mixer', value: defaultmixer});
		this.updateVolumeSettings();
	}

}

ControllerAlsa.prototype.checkMixer  = function () {
	var self = this;

	var mixer_tpye = self.config.get('mixer_type');
	var outputdevice = self.config.get('outputdevice');



	if (mixer_tpye === 'Hardware') {
		var mixers = self.getMixerControls(outputdevice);

		if (mixers.length > 0) {

			if  (mixers[0] === 'SoftMaster') {
				self.logger.info('Hardware Mixer mismatch, hardware mixer type but softmixer selected, correcting ');
				self.setConfigParam({key: 'mixer_type', value: 'Software'});
				self.setConfigParam({key: 'mixer', value: 'SoftMaster'});
				self.setConfigParam({key: 'mixer_type', value: 'Software'});
				if (this.config.has('softvolumenumber') == false) {
					self.config.addConfigValue('softvolumenumber', 'string', outputdevice);
				} else {
					self.setConfigParam({key: 'softvolumenumber', value: outputdevice});
				}
				self.commandRouter.sharedVars.set('alsa.outputdevicemixer', 'SoftMaster');
				self.commandRouter.sharedVars.set('alsa.outputdevice', 'softvolume');
				self.updateVolumeSettings();
				//Restarting MPD, this seems needed only on first boot
				setTimeout(function () {
					self.commandRouter.executeOnPlugin('music_service', 'mpd', 'restartMpd', '');
				}, 1500);
			}
		} else {
			self.logger.info('Hardware Mixer selected but no Hardware mixer available, detecting default mixer');
			self.setDefaultMixer(outputdevice);
		}

	}
}

ControllerAlsa.prototype.enableSoftMixer  = function (data) {
	var self = this;

	self.logger.info('Enable softmixer device for audio device number '+data);


	self.writeSoftMixerFile(data)
		.then(self.setSoftParams.bind(self))
		.then(self.apply1.bind(self))
		.then(self.apply2.bind(self))
		.then(self.setSoftConf.bind(self))
		.then(self.setSoftVolConf.bind(self))
		.then(self.restartMpd.bind(self))

}
ControllerAlsa.prototype.writeSoftMixerFile  = function (data) {
	var self = this;
	var defer = libQ.defer();

	self.logger.info('Enable softmixer device for audio device number '+data);
	var outnum = data;
	self.commandRouter.volumioStop();
	if (this.config.has('softvolumenumber') == false) {
		self.config.addConfigValue('softvolumenumber', 'string', data);
		self.updateVolumeSettings();
	} else {
		self.setConfigParam({key: 'softvolumenumber', value: data});
	}

	var asoundcontent = '';
	asoundcontent += 'pcm.softvolume {\n';
	asoundcontent += '    type             plug\n';
	asoundcontent += '    slave.pcm       "softvol"\n';
	asoundcontent += '}\n';
	asoundcontent += '\n';
	asoundcontent += 'pcm.softvol {\n';
	asoundcontent += '    type            softvol\n';
	asoundcontent += '    slave {\n';
	asoundcontent += '        pcm         "plughw:'+data+',0"\n';
	asoundcontent += '    }\n';
	asoundcontent += '    control {\n';
	asoundcontent += '        name        "SoftMaster"\n';
	asoundcontent += '        card        '+data+'\n';
	asoundcontent += '        device      0\n';
	asoundcontent += '    }\n';
	asoundcontent += 'max_dB 0.0\n';
	asoundcontent += 'min_dB -50.0\n';
	asoundcontent += 'resolution 100\n';
	asoundcontent += '}\n';

	fs.writeFile('/home/volumio/.asoundrc', asoundcontent, 'utf8', function (err) {
		if (err) {
			self.logger.info('Cannot write /etc/asound.conf: '+err)
		} else {
			self.logger.info('Asound.conf file written');
			var mv = execSync('/usr/bin/sudo /bin/mv /home/volumio/.asoundrc /etc/asound.conf', { uid:1000, gid: 1000, encoding: 'utf8' });
			var apply = execSync('/usr/sbin/alsactl -L -R nrestore', { uid:1000, gid: 1000, encoding: 'utf8' });
			defer.resolve();

		}
	});

	return defer.promise;
};

ControllerAlsa.prototype.setSoftParams  = function () {
	var self = this;
	var defer = libQ.defer();

	self.setConfigParam({key: 'mixer', value: "SoftMaster"});
	self.setConfigParam({key: 'outputdevice', value: "softvolume"});

	defer.resolve();
	return defer.promise;
};

ControllerAlsa.prototype.apply1  = function () {
	var self = this;
	var defer = libQ.defer();

	try {
		var apply2 = execSync('/usr/bin/aplay -D softvolume /volumio/app/silence.wav', { encoding: 'utf8' });
	} catch (e) {

	}

	defer.resolve();
	return defer.promise;
};

ControllerAlsa.prototype.apply2  = function () {
	var self = this;
	var defer = libQ.defer();

	var apply3 = execSync('/usr/sbin/alsactl -L -R nrestore', { uid:1000, gid: 1000, encoding: 'utf8' });
	defer.resolve();
	return defer.promise;
};

ControllerAlsa.prototype.setSoftConf  = function () {
	var self = this;
	var defer = libQ.defer();

	self.commandRouter.sharedVars.set('alsa.outputdevicemixer', "SoftMaster");
	self.commandRouter.sharedVars.set('alsa.outputdevice', 'softvolume');

	defer.resolve();
	return defer.promise;
};


ControllerAlsa.prototype.setSoftVolConf  = function () {
	var self = this;
	var defer = libQ.defer();

	self.updateVolumeSettings();
	defer.resolve();
	return defer.promise;
};

ControllerAlsa.prototype.restartMpd  = function () {
	var self = this;
	var defer = libQ.defer();

	setTimeout(function () {
		self.commandRouter.executeOnPlugin('music_service', 'mpd', 'restartMpd', '')
		defer.resolve();
	}, 1500);

	return defer.promise;
};



ControllerAlsa.prototype.disableSoftMixer  = function (data) {
	var self = this;

	self.logger.info('Disable softmixer device for audio device');


	var asoundcontent = '';


	fs.writeFile('/home/volumio/.asoundrc', asoundcontent, 'utf8', function (err) {
		if (err) {
			self.logger.info('Cannot write /etc/asound.conf: '+err)
		} else {
			self.logger.info('Asound.conf file written');
			var mv = execSync('/usr/bin/sudo /bin/mv /home/volumio/.asoundrc /etc/asound.conf', { uid:1000, gid: 1000, encoding: 'utf8' });
			var apply = execSync('/usr/sbin/alsactl -L -R nrestore', { uid:1000, gid: 1000, encoding: 'utf8' });
			self.updateVolumeSettings();
			var apply3 = execSync('/usr/sbin/alsactl -L -R nrestore', { uid:1000, gid: 1000, encoding: 'utf8' });
		}
	});
}


ControllerAlsa.prototype.updateVolumeSettings  = function () {
	var self = this;

	var outdevicename = '';
	var cards = self.getAlsaCards();
	var valvolumecurvemode = self.config.get('volumecurvemode');
	var valdevice = self.config.get('outputdevice');
	var valvolumemax = self.config.get('volumemax');
	var valmixer = self.config.get('mixer');
	var valmixertype = self.config.get('mixer_type');


	if (valdevice != 'softvolume') {
		if (cards[valdevice]!= undefined){
			var outdevicename = cards[valdevice].name;
		}

	} else {
		var outdevicename = 'softvolume';
	}

	if (valmixertype === 'Software') {
		valdevice = self.config.get('softvolumenumber');
	}
	var valvolumestart = self.config.get('volumestart');
	var valvolumesteps = self.config.get('volumesteps');

	var settings = {
		device : valdevice,
		name : outdevicename,
		mixer : valmixer,
		mixertype: valmixertype,
		maxvolume : valvolumemax,
		volumecurve : valvolumecurvemode,
		volumestart : valvolumestart,
		volumesteps : valvolumesteps
	}

	return self.commandRouter.volumioUpdateVolumeSettings(settings)
}

ControllerAlsa.prototype.enablePiJack  = function () {
	var self = this;

	exec('/usr/bin/amixer cset numid=3 1', function (error, stdout, stderr) {
		if (error) {
			self.logger.error('Cannot Enable Raspberry PI Jack Output: '+error);
		} else {
			self.logger.error('Raspberry PI Jack Output Enabled ');
			self.storeAlsaSettings();
		}
	});

}

ControllerAlsa.prototype.enablePiHDMI  = function () {
	var self = this;


	exec('/usr/bin/amixer cset numid=3 2', function (error, stdout, stderr) {
		if (error) {
			self.logger.error('Cannot Enable Raspberry PI HDMI Output: '+error);
		} else {
			self.logger.error('Raspberry PI HDMI Output Enabled ');
			self.storeAlsaSettings();
		}
	});

}

ControllerAlsa.prototype.storeAlsaSettings  = function () {
	var self = this;
	exec('/usr/bin/sudo /usr/sbin/alsactl store', function (error, stdout, stderr) {
		if (error) {
			self.logger.error('Cannot Store Alsa Settings: '+error);
		} else {
			self.logger.error('Alsa Settings successfully stored');
		}
	});
}

ControllerAlsa.prototype.getAudioDevices  = function () {
	var self = this;

	var defer = libQ.defer();
	var cards = self.getAlsaCards();
	var devicesarray = [];
	var carddetail = '';
	var i2sdevice = '';


	for (var i in cards) {
		if (cards[i].name === 'Audio Jack') {
			carddetail = {'id': cards[i].id, 'name': 'Audio Jack'};
			devicesarray.push(carddetail);
			var carddetail2 = {'id': cards[i].id, 'name': 'HDMI Out'};
			devicesarray.push(carddetail2);
		} else
		{
			carddetail = {'id': cards[i].id, 'name': cards[i].name};
			devicesarray.push(carddetail);
		}
	}

	var outdevicename = self.config.get('outputdevicename');
	if (outdevicename) {

	} else {
		outdevicename = devicesarray[0].name;
	}

	var i2soptions = self.commandRouter.executeOnPlugin('system_controller', 'i2s_dacs', 'getI2sOptions');
	var i2sstatus = self.commandRouter.executeOnPlugin('system_controller', 'i2s_dacs', 'getI2sStatus');
	if (i2sstatus.enabled) {
		i2sdevice = i2sstatus.name;
	}

	if(i2soptions.length > 0) {
		var i2sarray = [];
		for(var i in i2soptions) {
			var i2scard = {'id': i2soptions[i].value, 'name': i2soptions[i].label}
			i2sarray.push(i2scard)
		}
		var response = {'devices':{'active':outdevicename,'available':devicesarray},'i2s':{'enabled':i2sstatus.enabled,'active':i2sdevice,'available':i2sarray}};
		defer.resolve(response);
	} else {
		var response = {'devices':devicesarray}
		defer.resolve(response);
	}

	return defer.promise;
}
