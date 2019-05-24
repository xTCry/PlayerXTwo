# PlayerXTwo (Node `mpg123` player)

![npm](https://img.shields.io/npm/v/playerxtwo.svg?style=flat-square)
![npm](https://img.shields.io/npm/dt/playerxtwo.svg?style=flat-square)


### Install mpg123 command line audio player (Ubuntu/Debian)
```
sudo apt install mpg123
```

### Install PlayerXTwo to Node
```shell
npm i vcoinws
```

## Usage

```js
const PlayerXTwo = require('playerxtwo');
let myPlayer = new PlayerXTwo();

let volume = 30;

PlayerXTwo.getDevices((devices) => {
  if(devices.get('HDA Intel'))
    myPlayer.create({
      device: devices.get('HDA Intel'),
      volume
    });
  else
    myPlayer.create({ volume });
});


myPlayer.on('play', function (valid) {
  console.log("Audio (Play)");
});
myPlayer.on('stop', function () {
  console.log("Audio (Stop)");
});
myPlayer.on('error', function (err) {
  console.error("Audio (ERROR)", err)
});


myPlayer.on('pause', function () {
  console.log("Audio (Pause)");
});
myPlayer.on('resume', function (data) {
  const name = data && data.name? data.name: "";
  console.log("Audio (Resume): "+ name);
});
myPlayer.on('end', function (data) {
  const name = data && data.name? data.name: "";
  console.log("Audio (End) " + name);
});

myPlayer.on('info', function (data) {
  const trackName = data.StreamTitle;
  console.log("Track info: " + trackName);
});
myPlayer.on('volume', function (data) {
  console.log("Volume set: " + data);
  myPlayer.volume = Math.floor(data);
});

player.play(__dirname+'/'+"someMusic.mp3");

```



### Device Objects

Device objects allow you to select different output sources for playback, provided you are using ALSA.
This functionality requires the `aplay` command, but is entirely optional.

`mpg.getDevices(callback)` - Gets array of ALSA output devices   
`devices.get(name)` - Finds device in array with given name, otherwise returns null   
`device.name` - Friendly name of device   
`device.address` - ALSA address of device


### Player Objects

`new new PlayerXTwo(device=null, volume=false)` - Create new instance, optionally specifing output device  
`player.play(file)` - Plays audio from a source  
`player.pause()` - Pauses the current track  
`player.stop()` - Stops the current track  
`player.setVolume(percent)` - Sets the volume from 0 to 100
`player.pitch(amt)` - Adjusts the pitch & speed of the track up or down. The limits seem to be around -0.75 to 0.1.  
`player.seek(progress)` - Seeks through the track with progress from 0 to 1. This fails before the `format` event has fired.  
`player.getProgress(callback)` - Retrieve current track progress from 0 to 1  
`player.close()` - Kills the mpg123 process  
`player._cmd(...)` - Sends a custom command to the mpg123 CLI. Get possible commands by running `mpg123 -R` then typing `HELP`
`player.next()` - Next track  


### Song Info Variables

Theses variables hold info about the current song, and are safe to read only once the `format` event has fired.

`player.track` - Current track name (with extention). Set to **null** when track completes.  
`player.file` - Full file path, exactly as it was entered into `player.play()`  
`player.mpeg` - MPEG encoding version  
`player.sampleRate` - Track sample rate  
`player.channels` - Number of channels  
`player.bitrate` - Track bitrate  
`player.length` - Track length in seconds, rounded to the nearest tenth  
`player.samples` - Track length in raw samples  
