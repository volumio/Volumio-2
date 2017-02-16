var socket = io();
var playerState = {};
var timeLastStateUpdate = 0;
var timerPlayback = null;
var libraryHistory = new Array();
var playlistHistory = new Array();
var nLibraryHistoryPosition = 0;
var nPlaylistHistoryPosition = 0;

// Define button actions --------------------------------------------
document.getElementById('button-volumioplay').onclick = function() {emitEvent('play', '');}
document.getElementById('button-volumiopause').onclick = function() {emitEvent('pause', '');}
document.getElementById('button-volumiostop').onclick = function() {emitEvent('stop', '');}
document.getElementById('button-volumioprev').onclick = function() {emitEvent('previous', '');}
document.getElementById('button-volumionext').onclick = function() {emitEvent('next', '');}
document.getElementById('button-clearconsole').onclick = clearConsole;
document.getElementById('button-volumeup').onclick = function() {emitEvent('volume', '+');}
document.getElementById('button-volumedown').onclick = function() {emitEvent('volume', '-');}
document.getElementById('button-volumemute').onclick = function() {emitEvent('volume', 'mute');}
document.getElementById('button-volumeunmute').onclick = function() {emitEvent('volume', 'unmute');}
document.getElementById('button-testtrue').onclick = function() {socket.emit('callMethod',  {endpoint:'system_controller/system',method:'setTestSystem',data:'true'})};
document.getElementById('button-testfalse').onclick = function() {socket.emit('callMethod',  {endpoint:'system_controller/system',method:'setTestSystem',data:'false'})};

// Socket.io form
var input1 = document.getElementById('form-ws-1');
var input2 = document.getElementById('form-ws-2');

document.querySelector('form.pure-form').addEventListener('submit', function (e) {

	//prevent the normal submission of the form
	e.preventDefault();
	// Emit first and second input value
	socket.emit(input1.value, input2.value);
	printConsoleMessage('WS Message '+ input1.value + ' ' + input2.value );
});

// Create listeners for websocket events--------------------------------
socket.on('connect', function() {
	printConsoleMessage('Websocket connected.');
	enableControls();
	//updateLibraryHistoryButtons();

	// Get the state upon load
	emitEvent('getState', '');

	// Get the play queue
	emitEvent('getQueue', '');

	// Request the music library root
	//emitEvent('getLibraryFilters', 'root');

	//emitEvent('getPlaylistIndex', 'root');
});

socket.on('disconnect', function() {
	printConsoleMessage('Websocket disconnected.');

	libraryHistory = new Array();
	nLibraryHistoryPosition = 0;
	playlistHistory = new Array();
	nPlaylistHistoryPosition = 0;
	clearPlayQueue();
	clearBrowseView();
	clearPlaylistView();
	clearPlayerStateDisplay();
});

socket.on('pushState', function(state) {
	playerState = state;
	timeLastStateUpdate = Date.now();
	updatePlayerStateDisplay();

	if (state.status === 'play') {
		startPlaybackTimer(state.seek);
	} else {
	}

});

socket.on('pushQueue', function(arrayQueue) {
	updatePlayerQueue(arrayQueue);
});

socket.on('pushLibraryFilters', function(objBrowseData) {
	libraryHistory.splice(nLibraryHistoryPosition + 1, libraryHistory.length - nLibraryHistoryPosition - 1, objBrowseData);
	libraryForward();
//	printConsoleMessage('pushLibraryFilters: ' + JSON.stringify(objBrowseData));
});

socket.on('pushLibraryListing', function(objBrowseData) {
	libraryHistory.splice(nLibraryHistoryPosition + 1, libraryHistory.length - nLibraryHistoryPosition - 1, objBrowseData);
	libraryForward();
//	printConsoleMessage('pushLibraryListing: ' + JSON.stringify(objBrowseData));
});

socket.on('pushPlaylistIndex', function(objBrowseData) {
	playlistHistory.splice(nPlaylistHistoryPosition + 1, playlistHistory.length - nPlaylistHistoryPosition - 1, objBrowseData);
	playlistForward();
//	printConsoleMessage('pushPlaylistIndex: ' + JSON.stringify(objBrowseData));
});

socket.on('pushPlaylistListing', function(objBrowseData) {
	playlistHistory.splice(nPlaylistHistoryPosition + 1, playlistHistory.length - nPlaylistHistoryPosition - 1, objBrowseData);
	playlistForward();
});

socket.on('printConsoleMessage', function(sMessage) {
	printConsoleMessage(sMessage);
});

socket.on('pushSendBugReport', function(data) {

	var json = JSON.parse(data);
	document.getElementById('bug-form-description').value = json.link;
	var btn = document.getElementById('bug-form-button');
	document.getElementById("bug-form-button").style.display = "none";
	document.getElementById("copy-button").style.display = "inline";
	document.getElementById("log-message").innerHTML = "Log successfully sent, this is the link to your log file";

});


// Define internal functions ----------------------------------------------
function clearConsole() {
	var nodeConsole = document.getElementById('console');

	while (nodeConsole.firstChild) {
		nodeConsole.removeChild(nodeConsole.firstChild);
	}
}

function enableControls() {
	arrayWebsocketControls = document.getElementsByClassName("control-websocket");

	for (i = 0; i < arrayWebsocketControls.length; i++) {
		arrayWebsocketControls[i].disabled = false;
	}
}

function disableControls() {
	arrayWebsocketControls = document.getElementsByClassName("control-websocket");

	for (i = 0; i < arrayWebsocketControls.length; i++) {
		arrayWebsocketControls[i].disabled = true;
	}
}

function printConsoleMessage(message) {
	var nodeListItem = document.createElement('li');
	var nodePre = document.createElement('PRE');
	nodePre.appendChild(document.createTextNode(message))

	nodeListItem.appendChild(nodePre);
	document.getElementById('console').appendChild(nodeListItem);

	var divConsole = document.getElementById('div-console');
	divConsole.scrollTop = divConsole.scrollHeight;
}

function updatePlayerStateDisplay() {
	clearPlayerStateDisplay();

	var nodeText = document.createTextNode(JSON.stringify(playerState));
	document.getElementById('playerstate').appendChild(nodeText);
}

function startPlaybackTimer(nStartTime) {
	window.clearInterval(timerPlayback);

	timerPlayback = window.setInterval(function() {
		playerState.seek = nStartTime + Date.now() - timeLastStateUpdate;
		updatePlayerStateDisplay();

	}, 500);
}

function stopPlaybackTimer() {
	window.clearInterval(timerPlayback);
}

function clearPlayerStateDisplay() {
	var nodePlayerState = document.getElementById('playerstate');

	if (nodePlayerState.firstChild) {
		while (nodePlayerState.firstChild) {
			nodePlayerState.removeChild(nodePlayerState.firstChild);
		}
	}
}

function updatePlayerQueue(arrayQueue) {
	clearPlayQueue();

	var nodePlayQueue = document.getElementById('div-playqueue');

	for (i = 0; i < arrayQueue.length; i++) {
		var curEntry = arrayQueue[i];

		var sText = curEntry.name;
		var sSubText = '';
		if ('service' in curEntry) {
			sSubText = sSubText.concat(' Service: ' + curEntry.service + '');
		}
		if ('uri' in curEntry) {
			sSubText = sSubText.concat(' Uri: ' + curEntry.uri + '');
		}
		if ('artist' in curEntry) {
			sSubText = sSubText.concat(' Artist: ' + curEntry.artist);
		}
		if ('album' in curEntry) {
			sSubText = sSubText.concat(' Album: ' + curEntry.album + '');
		}
		if ('albumart' in curEntry) {
			sSubText = sSubText.concat(' Albumart: ' + curEntry.albumart + '');
		}


		var buttonRemove = document.createElement('button');
		buttonRemove.appendChild(document.createTextNode('Remove'));
		buttonRemove.className = 'button-itemaction';
		buttonRemove.onclick = removeQueueItem(i);

		var nodeSpan = document.createElement('span');
		nodeSpan.appendChild(document.createTextNode(sText));
		nodeSpan.appendChild(buttonRemove);
		nodeSpan.appendChild(document.createElement('br'));
		nodeSpan.appendChild(document.createTextNode(sSubText));

		var nodeListItem = document.createElement('li');
		nodeListItem.appendChild(nodeSpan);
		nodePlayQueue.appendChild(nodeListItem);
	}
}

function clearPlayQueue() {
	var nodePlayQueue = document.getElementById('div-playqueue');

	if (nodePlayQueue.firstChild) {
		while (nodePlayQueue.firstChild) {
			nodePlayQueue.removeChild(nodePlayQueue.firstChild);
		}
	}
}

function updateBrowseView(objBrowseData) {
	clearBrowseView();

	//printConsoleMessage(JSON.stringify(objBrowseData));

	var nodeBrowseView = document.getElementById('browseview');
	var arrayDataKeys = Object.keys(objBrowseData);
	for (i = 0; i < arrayDataKeys.length; i++) {
		var curEntry = objBrowseData[arrayDataKeys[i]];

		var sText = curEntry.name;
		var sSubText = '';
		if ('artists' in curEntry) {
			sSubText = sSubText.concat(' [Artists]: ' + JSON.stringify(curEntry.artists));
		}
		if ('albums' in curEntry) {
			sSubText = sSubText.concat(' [Albums]: ' + JSON.stringify(curEntry.albums) + '');
		}
		if ('tracknumber' in curEntry) {
			sSubText = sSubText.concat(' [Tracknumber]: ' + JSON.stringify(curEntry.tracknumber));
		}
		if ('date' in curEntry) {
			sSubText = sSubText.concat(' [Date]: ' + JSON.stringify(curEntry.date) + '');
		}
		if ('uris' in curEntry) {
			sSubText = sSubText.concat(' [Uris]: ' + JSON.stringify(curEntry.uris) + '');
		}

		var sBrowseField = '';
		var sSortBy = '';
		var arrayDataPath = [];
		var bIsIndex = false;
		if (curEntry.type === 'genre') {
			sSortBy = 'name';
			arrayDataPath = ['artistuids', '#', {'name': 'name', 'uid': 'uid', 'type': 'type', 'genres': ['genreuids', '#', {'name': 'name', 'uid': 'uid'}]}];
		} else if (curEntry.type === 'artist') {
			sSortBy = 'date';
			arrayDataPath = ['albumuids', '#', {'name': 'name', 'uid': 'uid', 'type': 'type', 'artists': ['artistuids', '#', {'name': 'name', 'uid': 'uid'}], 'date': 'date'}];
		} else if (curEntry.type === 'album') {
			sSortBy = 'tracknumber';
			arrayDataPath = ['trackuids', '#', {'name': 'name', 'uid': 'uid', 'type': 'type', 'albums': ['albumuids', '#', {'name': 'name', 'uid': 'uid'}], 'artists': ['artistuids', '#', {'name': 'name', 'uid': 'uid'}], 'tracknumber': 'tracknumber', 'date': 'date', 'uris': 'uris'}];
		} else if (curEntry.type === 'index') {
			sSortBy = '';
			arrayDataPath = ['childindex'];
			bIsIndex = true;
		}
		var objBrowseParameters = {'uid': curEntry['uid'], 'options': {'sortby': sSortBy, 'datapath': arrayDataPath, 'entries': 0, 'index': 0}};

		var nodeLink = document.createElement('a');
		nodeLink.setAttribute('href', '#');
		nodeLink.appendChild(document.createTextNode(sText));

		var nodeSpan = document.createElement('span');
		nodeSpan.appendChild(nodeLink);

		if (sSubText.length > 0) {
			nodeSpan.appendChild(document.createElement('br'));
			nodeSpan.appendChild(document.createTextNode(sSubText));
		}

		if (bIsIndex) {
			nodeLink.onclick = linkGetLibraryFilters(curEntry['uid']);
		} else {
			var buttonAdd = document.createElement('button');
			buttonAdd.appendChild(document.createTextNode('Add'));
			buttonAdd.className = 'button-itemaction';
			buttonAdd.onclick = addQueueUids([curEntry['uid']]);
			nodeSpan.appendChild(buttonAdd);
			nodeLink.onclick = linkGetLibraryListing(objBrowseParameters);
		}

		var nodeListItem = document.createElement('LI');
		nodeListItem.appendChild(nodeSpan);
		nodeBrowseView.appendChild(nodeListItem);
	}
}

function linkGetLibraryListing(objBrowseParameters) {
	return function() {
		emitEvent('getLibraryListing', objBrowseParameters);
	}
}

function linkGetLibraryFilters(sUid) {
	return function() {
		emitEvent('getLibraryFilters', sUid);
	}
}

function updatePlaylistView(objPlaylistData) {
	clearPlaylistView();

	//printConsoleMessage(JSON.stringify(objBrowseData));

	var nodePlaylistView = document.getElementById('playlistview');
	var arrayDataKeys = Object.keys(objPlaylistData);
	for (i = 0; i < arrayDataKeys.length; i++) {
		var curEntry = objPlaylistData[arrayDataKeys[i]];

		var sText = curEntry.name;
		var sSubText = '';

		var buttonAdd = document.createElement('button');
		buttonAdd.appendChild(document.createTextNode('Add'));
		buttonAdd.className = 'button-itemaction';
		buttonAdd.onclick = addQueueUids([curEntry['uid']]);

		var nodeLink = document.createElement('a');
		nodeLink.setAttribute('href', '#');
		nodeLink.appendChild(document.createTextNode(sText));
		nodeLink.onclick = linkGetPlaylistIndex(curEntry['uid']);

		var nodeSpan = document.createElement('span');
		nodeSpan.appendChild(nodeLink);
		//nodeSpan.appendChild(buttonAdd);
		nodeSpan.appendChild(document.createElement('br'));
		nodeSpan.appendChild(document.createTextNode(sSubText));

		var nodeListItem = document.createElement('LI');
		nodeListItem.appendChild(nodeSpan);
		nodePlaylistView.appendChild(nodeListItem);
	}
}

function linkGetPlaylistIndex(sUid) {
	return function() {
		emitEvent('getPlaylistIndex', sUid);
	}
}

function addQueueUids(arrayUids) {
	return function() {
		emitEvent('addQueueUids', arrayUids);
	}
}

function removeQueueItem(nIndex) {
	return function() {
		emitEvent('removeQueueItem', nIndex);
	}
}

function clearBrowseView() {
	var nodeBrowseView = document.getElementById('browseview');

	if (nodeBrowseView.firstChild) {
		while (nodeBrowseView.firstChild) {
			nodeBrowseView.removeChild(nodeBrowseView.firstChild);
		}
	}
}

function clearPlaylistView() {
	var nodePlaylistView = document.getElementById('playlistview');

	if (nodePlaylistView.firstChild) {
		while (nodePlaylistView.firstChild) {
			nodePlaylistView.removeChild(nodePlaylistView.firstChild);
		}
	}
}

function emitEvent(sEvent, sParam1, sParam2) {
	socket.emit(sEvent, sParam1, sParam2);
	printConsoleMessage('[Event]: ' + sEvent + ' [Parameters]:' + JSON.stringify(sParam1) + ', ' + JSON.stringify(sParam2));
}

document.querySelector('form.bug-form').addEventListener('submit', function (e) {
	//prevent the normal submission of the form
	var inputBugDesc = document.getElementById('bug-form-description');
	e.preventDefault();
	// Emit first and second input value
	var obj = {
		text : inputBugDesc.value
	};
	socket.emit('callMethod',  {endpoint:'system_controller/system',method:'sendBugReport',data:obj});

});

var clipboardDemos = new Clipboard('[data-clipboard-demo]');
clipboardDemos.on('success', function(e) {
	e.clearSelection();
});

var btns = document.querySelectorAll('.btn');
for (var i = 0; i < btns.length; i++) {
	btns[i].addEventListener('mouseleave', function(e) {
		e.currentTarget.setAttribute('class', 'btn');
		e.currentTarget.removeAttribute('aria-label');
	});
}

