
var fs = require('fs');
var sys = require('sys');
var Png = require('../node-png/build/Release/png').Png;
var Buffer = require('buffer').Buffer;

var d2xy = require('hilbert2d').d2xy;
var xy2d = require('hilbert2d').xy2d;

var xyz2d = require('hilbert3d').xyz2d;
var d2xyz = require('hilbert3d').d2xyz;

var canvasWidth = 512;
var canvasHeight = 512;
var blocks = 1;

var blockWidth = canvasWidth / blocks;
var blockHeight = canvasHeight / blocks;

var data = '';

var buffer = new Buffer(canvasWidth*canvasHeight*4);

var scalingFactor = 256*256*256/blocks/blocks;

var num = 0;

for (var y = 0; y < canvasHeight; ++y) {
  for (var x = 0; x < canvasWidth; ++x) {
    if (num % 100000 == 0) {
      console.log("\t%d/%d..",num, canvasWidth*canvasHeight);
    }

    var blockX = Math.floor(x / blockWidth);
    var blockY = Math.floor(y / blockHeight);

    var d = xy2d(blockX, blockY);
    var scaledD = d * scalingFactor;
    var color = d2xyz(scaledD);

    var arr = color.arr;
    arr = String.fromCharCode.apply(String, color.arr.concat([0]));
    data += arr;
    num++;
  }
}

console.log(typeof data);
console.log("len: %d", data.length);
console.log("scale: " + scalingFactor);
console.log("%d, %d", data.length, data.length / 4);
buffer.write(data, 'binary');

var p = new Png(buffer, canvasWidth, canvasHeight, 'rgba');
var png_image = p.encodeSync();
fs.writeFileSync('hilbert-' + blocks + '.png', png_image.toString('binary'), 'binary');
