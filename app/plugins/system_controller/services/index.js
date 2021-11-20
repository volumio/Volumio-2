'use strict';

var fs = require('fs-extra');

// Define the ControllerServices class
module.exports = ControllerServices;

function ControllerServices (context) {
  var self = this;

  // Save a reference to the parent commandRouter
  self.context = context;
  self.commandRouter = self.context.coreCommand;
}

ControllerServices.prototype.onStop = function () {
  var self = this;
  // Perform startup tasks here
};

ControllerServices.prototype.onRestart = function () {
  var self = this;
  // Perform startup tasks here
};

ControllerServices.prototype.onInstall = function () {
  var self = this;
  // Perform your installation tasks here
};

ControllerServices.prototype.onUninstall = function () {
  var self = this;
  // Perform your installation tasks here
};

ControllerServices.prototype.getUIConfig = function () {
  var self = this;

  var uiconf = fs.readJsonSync(__dirname + '/UIConfig.json');

  var plugins = self.commandRouter.pluginManager.getPluginNames('music_service');

  for (var i in plugins) {
    var pluginName = plugins[i];
    if (self.commandRouter.pluginManager.isEnabled('music_service', pluginName) == true) {
      var plugin = self.commandRouter.pluginManager.getPlugin('music_service', pluginName);

      uiconf.sections.push(plugin.getUIConfig());
    }
  }

  return uiconf;
};

ControllerServices.prototype.setUIConfig = function (data) {
  var self = this;

  var uiconf = fs.readJsonSync(__dirname + '/UIConfig.json');
};

ControllerServices.prototype.getConf = function (varName) {
  var self = this;

  return self.config.get(varName);
};

ControllerServices.prototype.setConf = function (varName, varValue) {
  var self = this;

  self.config.set(varName, varValue);
};

// Optional functions exposed for making development easier and more clear
ControllerServices.prototype.getSystemConf = function (pluginName, varName) {
  var self = this;
  // Perform your installation tasks here
};

ControllerServices.prototype.setSystemConf = function (pluginName, varName) {
  var self = this;
  // Perform your installation tasks here
};

ControllerServices.prototype.getAdditionalConf = function () {
  var self = this;
  // Perform your installation tasks here
};

ControllerServices.prototype.setAdditionalConf = function () {
  var self = this;
  // Perform your installation tasks here
};
