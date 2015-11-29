module.exports = updater_comm;
var Inotify = require('inotify').Inotify;
var inotify = new Inotify(); //persistent by default, new Inotify(false) //no persistent 
global.io   = require('socket.io')(3005);
global.exec = require('child_process').exec;
global.fs   = require('fs');
require('shelljs');

function updater_comm(context) {
	var self = this;
}


updater_comm.prototype.onVolumioStart = function() {
    io.sockets.on('connection', function(socket){
        var sachet = socket
        socket.on("update", function (msg,data) {
            if (msg.value == "now" ) {
                exec("/usr/bin/sudo /bin/systemctl restart volumio-remote-updater@update", function(error, stdout, stderr) {
                }); }
            });
        socket.on("updateCheck", function (msg,data) {
            exec("/usr/bin/sudo /bin/systemctl restart volumio-remote-updater@updateCheck", function(error, stdout, stderr) {
            });
            console.log("updatecheck done");
        });
        socket.on("factoryReset", function (msg,data) {
            exec("/usr/bin/sudo /bin/systemctl restart volumio-remote-updater@factoryReset")
        });

        var cmd = '/usr/bin/touch /tmp/updater';
        stats = fs.lstatSync('/tmp/updater');
        if (stats.isFile()) {
            cmd = "/bin/echo"
        }

        var callback = function(event) {
            var mask = event.mask;
            var type = mask & Inotify.IN_ISDIR ? 'directory ' : 'file ';
            event.name ? type += ' ' + event.name + ' ': ' ';
            if(mask & Inotify.IN_CLOSE_WRITE) {
                fs = require('fs')
                fs.readFile('/tmp/updater', function (err,dota) {
                    data = dota.toString()
                    console.log("Got " + data);
                    var arr = data.split("\n")
                    if (arr.length > 1) { 
                        var message = arr[0];
                        var obj = JSON.parse(arr[1]);
                        sachet.emit(message,obj)
                    }
                });
            } 
        }
        exec(cmd, function(error, stdout, stderr) {
            var self = this;
            var ilFile = { path:  '/tmp/updater',
            watch_for: Inotify.IN_CLOSE_WRITE,
            callback:  callback
        };
        self.ilFileDescriptor = inotify.addWatch(ilFile);
    });
    });
}

updater_comm.prototype.onStop = function() {
    var self = this;
    inotify.removeWatch(self.ilFileDescriptor)
}

updater_comm.prototype.onRestart = function() {
    var self = this;
    //Perform startup tasks here
}

updater_comm.prototype.onInstall = function()
{
    var self = this;
    //Perform your installation tasks here
}

updater_comm.prototype.onUninstall = function()
{
    var self = this;
    //Perform your installation tasks here
}

updater_comm.prototype.getUIConfig = function()
{
    var self = this;

    return {success:true,plugin:"updater_comm"};
}

updater_comm.prototype.setUIConfig = function(data)
{
    var self = this;
    //Perform your installation tasks here
}

updater_comm.prototype.getConf = function(varName)
{
    var self = this;
    //Perform your installation tasks here
}

updater_comm.prototype.setConf = function(varName, varValue)
{
    var self = this;
    //Perform your installation tasks here
}

//Optional functions exposed for making development easier and more clear
updater_comm.prototype.getSystemConf = function(pluginName,varName)
{
    var self = this;
    //Perform your installation tasks here
}

updater_comm.prototype.setSystemConf = function(pluginName,varName)
{
    var self = this;
    //Perform your installation tasks here
}

updater_comm.prototype.getAdditionalConf = function()
{
    var self = this;
    //Perform your installation tasks here
}

updater_comm.prototype.setAdditionalConf = function()
{
    var self = this;
    //Perform your installation tasks here
}
