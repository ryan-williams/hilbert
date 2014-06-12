
var fs = require('fs');
var Png = require('../node-png/build/Release/png').Png;
var Buffer = require('buffer').Buffer;

var argv = require('minimist')(process.argv.slice(2));

var canvasSize = argv.size || 512;

var xy2d = require('hilbert2d').xy2d;

var d2xyz = require('hilbert3d').d2xyz;

var blocks = argv.blocks || 8;
var acceptableBlocks = { 1: 1, 8: 1, 64: 1, 512: 1, 4096: 1 };
if (!(blocks in acceptableBlocks)) {
  throw new Error("Invalid block size: " + blocks + ". Must be one of {1,8,64,512,4096}.");
}

var projectionType = argv.projection || 'scaleXYZ';
if (!projectionType in { 'scaleD': 1, 'scaleXYZ': 1 }) {
  throw new Error("Invalid projection type: " + projectionType + ". Must be one of {scaleD, scaleXYZ}.");
}

var blockSize = canvasSize / blocks;

var data = '';
var buffer = new Buffer(canvasSize*canvasSize*4);

var scalingFactor = 256*256*256/blocks/blocks;

var scalingFactor3d = 255 / (Math.round(Math.pow(blocks, 2/3)) - 1);
console.log("3d scaling: %d", scalingFactor3d);

var num = 0;

var debug = true;
function log() {
  if (debug) {
    console.log.apply(console, arguments);
  }
}

function computeColorForBlock(x, y) {
  var d = xy2d(x, y);

  var color = null;
  if (projectionType == 'scaleD') {
    var scaledD = d * scalingFactor;
    color = d2xyz(scaledD);
    log("block (%d,%d): d: %d, scaled: %d, color: [%s]", x, y, d, scaledD, color.arr.join(','));
  } else if (projectionType == 'scaleXYZ') {
    var xyz = d2xyz(d);
    color = xyz.mult(scalingFactor3d);
    log("block (%d,%d): d: %d, xyz: [%s], color: [%s]", x, y, d, xyz.arr.join(','), color.arr.join(','));
  } else {
    throw new Error('Unrecognized projection type: ' + projectionType);
  }

  return color.arr.concat([0]);
}

var blockColorCache = [];
function getColorForBlock(x, y) {
  if (!(x in blockColorCache)) {
    blockColorCache[x] = [];
  }
  if (!(y in blockColorCache[x])) {
    blockColorCache[x][y] = computeColorForBlock(x, y);
  }

  return blockColorCache[x][y];
}

for (var y = 0; y < canvasSize; ++y) {
  for (var x = 0; x < canvasSize; ++x) {
    if (num % 100000 == 0) {
      console.log("\t%d/%d..",num, canvasSize*canvasSize);
    }

    var blockX = Math.floor(x / blockSize);
    var blockY = Math.floor(y / blockSize);

    var color = getColorForBlock(blockX, blockY);

    data += String.fromCharCode.apply(String, color);
    num++;
  }
}

console.log(typeof data);
console.log("len: %d", data.length);
console.log("scale: " + scalingFactor);
console.log("%d, %d", data.length, data.length / 4);
buffer.write(data, 'binary');

var p = new Png(buffer, canvasSize, canvasSize, 'rgba');
var png_image = p.encodeSync();
var filename = 'hilbert-' + blocks + '-' + canvasSize + 'x' + canvasSize + '-' + projectionType + '.png';
fs.writeFileSync(filename, png_image.toString('binary'), 'binary');
