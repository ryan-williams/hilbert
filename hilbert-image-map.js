
var fs = require('fs');
var Png = require('../node-png/build/Release/png').Png;
var FixedPngStack = require('../node-png/build/Release/png').FixedPngStack;
var Buffer = require('buffer').Buffer;
var moment = require('moment');

var HilbertImageMap = exports.HilbertImageMap = function(argv) {

  var canvasSize = argv.size || 512;

  var printProgressIncrement = argv.printEvery || 10000;

  var dryRun = !!argv['dry-run'];

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

  var memoizePositions = ('memoize' in argv) ? !!argv.memoize : (canvasSize > blocks);
  console.log("memoizing: %s", memoizePositions);

  function computeColorForBlock(x, y) {
    var d = xy2d(x, y);

    var color = null;
    if (projectionType == 'scaleD') {
      var scaleD = d * scalingFactor;
      color = d2xyz(scaleD);
    } else if (projectionType == 'scaleXYZ') {
      var xyz = d2xyz(d);
      color = xyz.mult(scalingFactor3d);
    } else {
      throw new Error('Unrecognized projection type: ' + projectionType);
    }

    return color.arr;
  }

  var blockColorCache = [];
  this.getColorForBlock = function(x, y) {
    if (memoizePositions) {
      if (!(x in blockColorCache)) {
        blockColorCache[x] = [];
      }
      if (!(y in blockColorCache[x])) {
        blockColorCache[x][y] = computeColorForBlock(x, y);
      }

      return blockColorCache[x][y];
    }
    return computeColorForBlock(x, y);
  };

  var previousNum = 0;
  var previousTime = moment();
  function printStatus(num, total) {
    if (num % printProgressIncrement == 0) {
      var now = moment();
      console.log(
            "%s:\t%d/%d (%d). rate: %d/s",
            now.format('HH:mm:ss'),
            num, total,
            (100*(num/total)).toFixed(2),
            ((num - previousNum) / (now - previousTime) * 1000).toFixed(2)
      );
      previousNum = num;
      previousTime = now;
    }
  }

  this.getPngByBlocks = function() {
    var png = new FixedPngStack(canvasSize, canvasSize, 'rgb');
    var num = 0;
    var totalBlocks = blocks*blocks;
    for (var blockX = 0; blockX < blocks; blockX++) {
      for (var blockY = 0; blockY < blocks; blockY++) {
        printStatus(num, totalBlocks);

        var color = this.getColorForBlock(blockX, blockY);

        var data = '';
        for (var i = 0; i < blockSize * blockSize; i++) {
          data += String.fromCharCode.apply(String, color);
        }
        if (!dryRun) {
          var buffer = new Buffer(blockSize * blockSize * 3);
          buffer.write(data, 'binary');
          png.push(buffer, blockX * blockSize, blockY * blockSize, blockSize, blockSize);
        }
        num++;
      }
    }
    return png.encodeSync();
  };

  this.getPngByPixels = function() {
    var buffer = new Buffer(canvasSize*canvasSize*3);
    var num = 0;
    var totalPixels = canvasSize*canvasSize;
    for (var y = 0; y < canvasSize; ++y) {
      for (var x = 0; x < canvasSize; ++x) {
        printStatus(num, totalPixels);

        var blockX = Math.floor(x / blockSize);
        var blockY = Math.floor(y / blockSize);

        var color = this.getColorForBlock(blockX, blockY);

        if (!dryRun) {
          buffer.write(String.fromCharCode.apply(String, color), 3 * (y * canvasSize + x), 3, 'binary');
        }
        num++;
      }
    }

    var png = new Png(buffer, canvasSize, canvasSize, 'rgb');
    return png.encodeSync();
  };

  this.createImage = function() {
    var png = null;
    if (pngConstructionMethod == "blocks") {
      png = this.getPngByBlocks();
    } else if (pngConstructionMethod == "pixels") {
      png = this.getPngByPixels();
    } else {
      throw new Error("Invalid construction method: " + pngConstructionMethod);
    }

    if (!dryRun) {
      console.log("Writing to: %s", filename);
      fs.writeFileSync(filename, png.toString('binary'), 'binary');
    } else {
      console.log("dry run, not writing");
    }
  };
};