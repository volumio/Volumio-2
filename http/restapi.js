var express = require('express');
var app = require('./index.js')
var bodyParser = require('body-parser');
var ip = require('ip');
var api = express.Router();
var ifconfig = require('wireless-tools/ifconfig');

function apiInterface(server, commandRouter) {

}

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.send(200);
    }
    else {
      next();
    }
};

// All routes will be routed trough /api and encoded in json
api.use(allowCrossDomain);
api.use('/api', api);
api.use(bodyParser.urlencoded({ extended: true }));
api.use(bodyParser.json());
// Routes for Volumio API


//Welcome Message
api.get('/', function(req, res) {
    res.json({ message: 'Welcome to Volumio API' });
});

//Get hosts IP
api.get('/host', function(req, res) {
    var self =this;

	var hostsarray = [];
	var interfacesarray = ['eth0','wlan0'];

	for (var i in interfacesarray){
		ifconfig.status(interfacesarray[i], function(err, status) {
			if (status != undefined && status.ipv4_address != undefined) {
				hostsarray.push('http://'+status.ipv4_address);
			}

			if (i === interfacesarray.length) {
				if(hostsarray.length > 1) {
					return res.json({ host: hostsarray[0], host2: hostsarray[1]});
				} else {
					return res.json({ host: hostsarray[0]});
				}

			}
			i++
		});
	}
});



module.exports = api;
