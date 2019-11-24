
const EventEmitter = require("events");
const fs = require('fs'),
	path = require('path'),
	util = require('util'),
	child_p = require('child_process'),
	{ exec, spawn } = child_p,
	evSys = require('event-stream'),
	through = require('through');

const isObject = function(a) {
    return (!!a) && (a.constructor === Object);
};

class PlayerXTwo extends EventEmitter {

	constructor(options) {
		super();


		if (!(this instanceof PlayerXTwo)) 
			return new PlayerXTwo();

		// Процесс проигрывателя
		this.PlayerProcess = null;
		
		// Стоит ли на паузе
		this.paused = false;
		// Ставилось ли на паузу
		this.wasBeenPaused = false;
		
		// Громкость
		this.volumeValue = 45;
		// Громкость для просмотра ()
		this.volume = false;
		
		// Не убивать процес...
		// this.handleExitHang = false;

		// Каталог по умолчанию
		this.fileDir = './';
		
		// Текущий плейлист
		this.currentPlaylist = [];
		
		this._s = -1;
		
		// Текущие параметры воспроизведения
		this.currentSettings = {};
		
		// Через какой девайс воспроизводим (По умолчанию: default)
		this.device = false;
		
		// EventEmitter.call(this);
		
		this.stream = false;
		
		// CallBack при окончании воспроизведения
		this.respawnCB = false;
		this.loopHelper = null;

		// Массив с кэлбэками на процесс
		this._gpcb = [];
		
		if(options)
			this.create(options);
	}

	create(options) {

		var settings = options || {};
		this.currentSettings = settings;

		this.saveOptions = { ...options };
		
		var cmd = 'mpg123';

		var args = [];
		
		args.push('-R'); // Generic remote interface
		
		// Device
		if (typeof settings.device == "number") {
			this.device = settings.device;
			args.push('-a');
			args.push("hw:"+this.device);
		}
		else if(settings.device == 'multi') {
			args.push('-a');
			args.push("alsa=multi");
		}
		else if(typeof settings.device == 'object') {
			args.push('-a'+settings.device.address);
		}
		

		args.push('-f');

		args.push(settings.volume? this.checkVolume(settings.volume): this.volumeValue);
	    
		this.PlayerProcess = spawn(cmd, args);
		this.stream = this.PlayerProcess.stdin;
		
		this.PlayerProcess.stdout
		.pipe(evSys.split())
		.pipe(through((data)=> {
			var line = data.split(' ');
						
			var type = line.shift();
						
			switch(type) {
				case '@P':
					var event = ['end', 'pause', 'resume'][+line.shift()];
					
					if(this._s >= 1)
						this.emit(event, { name: this.track });
					
					if(event == 'end' && this._s != 1) {
						this.wasBeenPaused = false;
						this.track = this.file = null;
					}
					
					if(event == 'pause')
						this.paused = true;
					
					if(event == 'resume')
						this.paused = false;
					
					if(event == 'end' && this.respawnCB)
						this.respawnCB();
					
					break;
						
				case '@E':
					var msg = line.join(' '),
						err = new Error(msg);
						
					err.type = 'mpg-player';
					
					if(msg.indexOf("No stream opened") != -1) {
						for(var i = 0,l = this._gpcb.length; i<l; i++)
							this._gpcb[i](0, 0, 0);
						
						this._gpcb = [];
					}
					
					this.emit('error', err);
					break;
					
				case '@F':
					this.emit('frame', line);
					break;
					
				case '@J':
					this.emit('jump');
					break;
					
				case '@V':
					var per = line[0];
					per = per.substring(0, per.length-1);
					this.emit('volume', per);
					break;
					
				case '@I':
					var type = line.shift()
					if(type == 'ICY-META:') {
						var msg = line.join(' '),
							re = /StreamTitle=\'(.*)\'\;/gi,
							StreamTitle = re.exec(msg)

						if(StreamTitle.length > 0)
							StreamTitle = StreamTitle[1]
						else
							StreamTitle = false;
						
						this.emit('info', {msg: msg, StreamTitle: StreamTitle});
					}
					break;
					
				case '@S':
					if(this._s == 1) {
						this.mpeg = Number(line[0]);
						this.sampleRate = line[2];
						this.channels = Number(line[4]);
						this.bitrate = Number(line[10]);
						this._s = 2;
						this._cmd('SAMPLE');
					}
					break;
					
				case '@SAMPLE':
					if(this._s == 2) {
						this.samples = line[1];
						this.length = Math.round((this.samples/this.sampleRate)*10)/10;
						this._s = 0;
						this.emit('format');
					}
					
					var s = line[0],
						l = line[1],
						p = (s/l);
						
					for(var i = 0,l = this._gpcb.length; i < l; i++)
						this._gpcb[i](p, s, l);
					
					this._gpcb = [];
					break;
			}
		}));
		
		return true;
	}

	_cmd() {
		if(!this.stream || !this.PlayerProcess)
			return;

		var args = [].slice.call(arguments);

		try {
			this.stream.write('\n');
			this.stream.write(args.join(' ') + '\n');
		} catch(e) {
			console.error("[PlayerX] Error [_cmd] (stream.write): ", e);
			
			this.emit('error', e);

			if([ "Cannot call write after a stream was destroyed", "This socket is closed" ].includes(e.message)) {
				if(this.saveOptions) {
					console.log("PlayerX try reCreate");
					this.close();
					this.create(this.saveOptions);
				}
				else
					console.error("[PlayerX] Не удалось пересоздать проигрыватель");
			}
		}

		return this;
	}

	play(files, options) {
		
		var settings = options || {};
		
		if (!this.PlayerProcess)
			this.create(options);
		
		if (this.wasBeenPaused) {
			if(!files || this.paused) {
				this._cmd('P');
				return true;
			}
		}
		
		
		if (!files) {
			throw new TypeError("No files specified");
		}
		if (typeof files !== 'string' && !util.isArray(files) && !isObject(files)) {
			throw new TypeError("Incorrect value for files: " + files);
		}
		
		if (typeof files === 'string' || (typeof files === 'object' && !util.isArray(files)) ) {
			files = [files];
	    }
		
		var play_files = this.resolveFilePaths(files/*, settings.url*/);
		this.respawnCB = null;
		
		// console.log("play_files", play_files);

		if ((play_files.length > 1) || (settings.loop)) {
			this.loopHelper = LoopHelper(play_files, settings.loop);

			this.respawnCB = function () {
				if (!this.loopHelper) {
					// Прекращаем перезапуск
					this.emit('end');
					return;
				}
				
				var nextAudio = this.loopHelper.getNext();
				if (!nextAudio) {
					this.loopHelper = null;
					this.emit('end');
				}
				else {
					// Продолжаем
					this.load(nextAudio);
				}
			};
		}
		else {
			this.load(play_files[0])
			this.respawnCB = ()=> {
				this.emit('end');
			};
		}	
		
		this.emit('play', true);
		return true;
	}

	// ftw remake (24.11.2019)
	resolveFilePaths(plist/*, _isUrl*/) {
		this.currentPlaylist = [];

		for(const audio of plist) {
			let audioPath = audio.path || audio.url || audio;
			const isLocal = !(/(http(s)?:\/\/.)/i).test(audioPath);

			if(isLocal) {
				audioPath = path.resolve(this.fileDir, audioPath);
				if (!fs.existsSync(audioPath)) {
					this.emit('error', new Error('File does not exist: ' + audioPath));
					continue;
				}
			}
			
			this.currentPlaylist.push({
				url: audioPath,
				name: (audio.name || audio.url || 'TrackName')
			});
		}

		return this.currentPlaylist;
	}

	load(audio) {
		// console.log("Load AUDIO", audio);
		// this.track = file.substr(file.lastIndexOf('/')+1);
		this.track = audio.name? audio.name: audio.url? audio.url: audio;
		this.file = audio.url;
		this._s = 1;
		return this._cmd('L', audio.url);
	}

	checkVolume(vol) {
		vol = (vol > 100)? 100: (vol < 0 || vol == 0)? 1: vol;
		vol = 32769 * (vol / 100);
		return vol;
	}

	stop() {
		this._s = -1;
		this.respawnCB = null;
		this.emit('stop');
		return this._cmd('S')
	}

	pause() {
		this.wasBeenPaused = true;
		return this._cmd('P');
	}
	next() {
		this._s = -1;
		return this._cmd('S')
	}

	setVolume(vol) {
		vol = Math.min(Math.max(vol, 0), 100);
		return this._cmd('V', vol);
	}
	pitch(pitch) {
		pitch = Math.min(Math.max(pitch, -0.75), 0.1);
		return this._cmd('PITCH', pitch);
	}
	seek(pos) {
		pos = Math.min(Math.max(pos, 0), 1);
		return this._cmd('K', Math.floor(pos*this.samples));
	}

	close() {
		this.PlayerProcess.kill();
	}

	getProgress(callback) {
		this._gpcb.push(callback);
		return this._cmd('SAMPLE');
	}

}

module.exports = PlayerXTwo;

module.exports.getDevices = function(callback) {
	execCmd('aplay -L', function(raw) {
		var lines = raw.split('\n'),
		devices = [],
		l = lines.length;
		
		for(var i = 0; i < l; i++) {
			var line = lines[i];
			if(line[0] == 'h' && line[1] == 'w' && line[2] == ':') {
				var name = lines[i+1];
				if(name) {
					name = name.substring(0, name.indexOf(',')).trim();
					devices.push({name: name, address: line});
				}
			}
		}
		
		devices.get = function(n) {
			for(var i = 0, l = this.length; i < l; i++)
				if(this[i].name == n)
					return this[i];
			return null;
		};
		
		callback(devices);
	});
}


var LoopHelper = function(files, loop) {
	var that = {};
	var current = -1;
	var getNext = function() {
		current += 1;
		if (current === files.length) {
			if (loop)
				current = -1;
			else
				return null;
		}
		return files[current];
	};
	that.getNext = getNext;
	return that;
};

function execCmd(cmd, callback) {
	child_p.exec(cmd, function (err, out, stderr) {
		if(err) {
			console.log("Command Exec Erorr: ", err);
			return;
		}
		if(stderr) { 
			console.log("Command Erorr: ", stderr);
			return;
		}
		
		if(callback) callback(out);
	});
}
