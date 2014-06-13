
var fs = require('fs');
var Png = require('../node-png/build/Release/png').Png;
var FixedPngStack = require('../node-png/build/Release/png').FixedPngStack;
var Buffer = require('buffer').Buffer;
var moment = require('moment');

var argv = require('minimist')(process.argv.slice(2));

var canvasSize = argv.size || 512;

var debug = !!argv.debug;

var xy2d = require('hilbert').xy2d;
var d2xyz = require('hilbert').d2xyz;

var pngConstructionMethod = argv.method || "pixels";
if (!(pngConstructionMethod in { "blocks": 1, "pixels": 1 })) {
  throw new Error("Invalid method: " + pngConstructionMethod + ". Must be one of {blocks,pixels}.");
}

var blocks = argv.blocks || 8;
var acceptableBlocks = { 1: 1, 8: 1, 64: 1, 512: 1, 4096: 1 };
if (!(blocks in acceptableBlocks)) {
  throw new Error("Invalid block size: " + blocks + ". Must be one of {1,8,64,512,4096}.");
}

var projectionNameMap = {
  xyz: 'scaleXYZ',
  scaleXYZ: 'scaleXYZ',
  d: 'scaleD',
  scaleD: 'scaleD'
};

var projectionType = argv.projection || 'scaleXYZ';
if (!projectionType in projectionNameMap) {
  throw new Error("Invalid projection type: " + projectionType + ". Must be one of {scaleD, scaleXYZ}.");
}
projectionType = projectionNameMap[projectionType];

var outfileRoot = argv.outbase || "hilbert";
var outfileDir = argv.outdir || ".";
if (outfileDir[outfileDir.length - 1] != '/') {
  outfileDir += '/';
}

var filename = outfileDir + outfileRoot + '-' + blocks + '-' + canvasSize + 'x' + canvasSize + '-' + projectionType + '.png';

var blockSize = canvasSize / blocks;

var scalingFactor = 256*256*256/blocks/blocks;
var scalingFactor3d = 255 / (Math.round(Math.pow(blocks, 2/3)) - 1);

function log() {
  if (debug) {
    console.log.apply(console, arguments);
  }
}

function computeColorForBlock(x, y) {
  var d = xy2d(x, y);

  var color = null;
  if (projectionType == 'scaleD') {
    var scaleD = d * scalingFactor;
    color = d2xyz(scaleD);
    log("block (%d,%d): d: %d, scaled: %d, color: [%s]", x, y, d, scaleD, color.arr.join(','));
  } else if (projectionType == 'scaleXYZ') {
    var xyz = d2xyz(d);
    color = xyz.mult(scalingFactor3d);
    log("block (%d,%d): d: %d, xyz: [%s], color: [%s]", x, y, d, xyz.arr.join(','), color.arr.join(','));
  } else {
    throw new Error('Unrecognized projection type: ' + projectionType);
  }

  return color.arr;
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

function getPngByBlocks() {
  var png = new FixedPngStack(canvasSize, canvasSize, 'rgb');
  var num = 0;
  for (var blockX = 0; blockX < blocks; blockX++) {
    for (var blockY = 0; blockY < blocks; blockY++) {
      if (num % 100000 == 0) {
        console.log("%s:\t%d/%d..", moment().format('HH:mm:ss'), num, blocks*blocks);
      }

      var color = getColorForBlock(blockX, blockY);

      var data = '';
      for (var i = 0; i < blockSize * blockSize; i++) {
        data += String.fromCharCode.apply(String, color);
      }
      var buffer = new Buffer(blockSize*blockSize*3);
      buffer.write(data, 'binary');
      png.push(buffer, blockX * blockSize, blockY * blockSize, blockSize, blockSize);

      num++;
    }
  }
  return png.encodeSync();
}

function getPngByPixels() {
  var buffer = new Buffer(canvasSize*canvasSize*3);
  var num = 0;
  for (var y = 0; y < canvasSize; ++y) {
    for (var x = 0; x < canvasSize; ++x) {
      if (num % 100000 == 0) {
        console.log("%s:\t%d/%d..", moment().format('HH:mm:ss'), num, canvasSize*canvasSize);
      }

      var blockX = Math.floor(x / blockSize);
      var blockY = Math.floor(y / blockSize);

      var color = getColorForBlock(blockX, blockY);

      buffer.write(String.fromCharCode.apply(String, color), 3 * (y*canvasSize + x), 3, 'binary');
      num++;
    }
  }

  var png = new Png(buffer, canvasSize, canvasSize, 'rgb');
  return png.encodeSync();
}

var png = null;
if (pngConstructionMethod == "blocks") {
  png = getPngByBlocks();
} else {
  png = getPngByPixels();
}

console.log("Writing to: %s", filename);
fs.writeFileSync(filename, png.toString('binary'), 'binary');
