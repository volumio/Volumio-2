'use strict';

var libQ = require('kew');
var fs=require('fs-extra');
var config = new (require('v-conf'))();
var exec = require('child_process').exec;
var execSync = require('child_process').execSync;


module.exports = outputs;
function outputs(context) {
	var self = this;

	this.context = context;
	this.commandRouter = this.context.coreCommand;
	this.logger = this.context.logger;
	this.configManager = this.context.configManager;

	this.output = {"availableOutputs": []};

}



outputs.prototype.onVolumioStart = function()
{
	var self = this;
	var configFile=this.commandRouter.pluginManager.getConfigurationFile(this.context,'config.json');
	this.config = new (require('v-conf'))();
	this.config.loadFile(configFile);

    return libQ.resolve();
}

outputs.prototype.onStart = function() {
    var self = this;
	var defer=libQ.defer();


	// Once the Plugin has successfull started resolve the promise
	defer.resolve();

    return defer.promise;
};

outputs.prototype.onStop = function() {
    var self = this;
    var defer=libQ.defer();

    // Once the Plugin has successfull stopped resolve the promise
    defer.resolve();

    return libQ.resolve();
};

outputs.prototype.onRestart = function() {
    var self = this;
    // Optional, use if you need it
};


// Configuration Methods -----------------------------------------------------------------------------

outputs.prototype.getUIConfig = function() {
    var defer = libQ.defer();
    var self = this;

    var lang_code = this.commandRouter.sharedVars.get('language_code');

    self.commandRouter.i18nJson(__dirname+'/i18n/strings_'+lang_code+'.json',
        __dirname+'/i18n/strings_en.json',
        __dirname + '/UIConfig.json')
        .then(function(uiconf)
        {


            defer.resolve(uiconf);
        })
        .fail(function()
        {
            defer.reject(new Error());
        });

    return defer.promise;
};


outputs.prototype.setUIConfig = function(data) {
	var self = this;
	//Perform your installation tasks here
};

outputs.prototype.getConf = function(varName) {
	var self = this;
	//Perform your installation tasks here
};

outputs.prototype.setConf = function(varName, varValue) {
	var self = this;
	//Perform your installation tasks here
};

outputs.prototype.addAudioOutput = function (data) {
	var self = this;

	self.logger.info("Adding audio output: ", data.id);

	if(data.id && data.name && data.type && data.icon && data.available &&
	data.enabled && data.volumeAvailable && data.volume && data.mute){
		this.output["availableOutputs"].push(data);
		this.pushAudioOutput();
	}
	else {
		self.logger.error("Error: format not recognized");
	}
}

outputs.prototype.updateAudioOutput = function (data) {
	var self = this;

	self.logger.info("Updating audio output: ", data.id);


	if(data.id && data.name && data.type && data.icon && data.available &&
		data.enabled && data.volumeAvailable && data.volume && data.mute) {
		var i = 0;
		var list = this.output["availableOutputs"];
		var found = false;

		while (i < list.length && !found) {
			i += 1;
			if (list[i].id == data.id)
				found = true;
		}

		if (i < this.output["availableOutputs"].length) {
			this.output["availableOutputs"][i] = data;
		}

		this.pushAudioOutput();
	}
	else {
		self.logger.error("Error: format not recognized");
	}
}

outputs.prototype.removeAudioOutput = function (id) {
	var self = this;

	self.logger.info("Removing audio output: ", data.id);

	var i = 0;
	var list = this.output["availableOutputs"];
	var found = false;

	while (i < list.length && !found) {
		i += 1;
		if (list[i].id == id)
			found = true;
	}

	if (i < this.output["availableOutputs"].length) {
		this.output["availableOutputs"][i].splice(i, 1);
	}

	this.pushAudioOutput();
}

outputs.prototype.getAudioOutput = function () {
	var self = this;

	return self.output;
}

outputs.prototype.pushAudioOutput = function () {
	var self = this;

	self.commandRouter.broadcastMessage('pushAudioOutputs', self.output);
}