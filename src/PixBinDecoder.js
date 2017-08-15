/*
* Author    Jonathan Lurie - http://me.jonahanlurie.fr
*
* License   MIT
* Link      https://github.com/jonathanlurie/pixpipejs
* Lab       MCIN - Montreal Neurological Institute
*/


import md5 from 'js-md5';
import { CodecUtils } from 'codecutils';
import { PixBlockDecoder } from './PixBlockDecoder.js';
import { PixBinEncoder } from './PixBinEncoder.js';

/**
* A PixBinDecoder instance decodes a *.pixp file and output an Image2D or Image3D.
* The input, specified by `.addInput(...)` must be an ArrayBuffer
* (from an `UrlToArrayBufferFilter`, an `UrlToArrayBufferReader` or anothrer source ).
*
* **Usage**
* - [examples/pixpFileToImage2D.html](../examples/pixpFileToImage2D.html)
*/
class PixBinDecoder {
  constructor(){
    this._verifyChecksum = false;
    this.reset();
  }


  /**
  * Specify an input
  * @param {ArrayBuffer} buff - the input
  */
  setInput( buff ){
    if( buff instanceof ArrayBuffer ){
      this._input = buff;
    }
  }


  /**
  * Get the the decoded output
  * @return {Object} a decoded object
  */
  getOutput(){
    return this._output;
  }


  /**
  * reset inputs and inputs
  */
  reset(){
    this._input = null;
    this._output = null;
  }


  /**
  * Specify wether or not  the bin decoder must perform a checksum verification
  * for each block to be decoded.
  * @param {Boolean} b - true to perfom verification, false to skip it (default: false)
  */
  enableBlockVerification( b ){
    this._verifyChecksum = b;
  }


  /**
  * Launch the decoding
  */
  run(){

    var input = this._input;

    if( !input ){
      console.warn("Input cannot be null");
      return;
    }

    var verifyChecksum = this._verifyChecksum;
    var inputByteLength = input.byteLength;
    var magicNumberToExpect = PixBinEncoder.MAGIC_NUMBER();

    // control 1: the file must be large enough
    if( inputByteLength < (magicNumberToExpect.length + 5) ){
      console.warn("This buffer does not match a PixBin file.");
      return;
    }

    var view = new DataView( input );
    var movingByteOffset = 0;
    var magicNumber = CodecUtils.getString8FromBuffer(input, magicNumberToExpect.length )

    // control 2: the magic number
    if( magicNumber !== magicNumberToExpect){
      console.warn("This file is not of PixBin type. (wrong magic number)");
      return;
    }

    movingByteOffset = magicNumberToExpect.length;
    var isLittleEndian = view.getUint8(movingByteOffset);

    // control 3: the endianess must be 0 or 1
    if(isLittleEndian != 0 && isLittleEndian != 1){
      console.warn("This file is not of PixBin type. (wrong endianess code)");
      return;
    }

    movingByteOffset += 1;
    var pixBinIndexBinaryStringByteLength = view.getUint32( movingByteOffset, isLittleEndian );
    movingByteOffset += 4;
    var pixBinIndexObj = CodecUtils.ArrayBufferToObject( input.slice(movingByteOffset, movingByteOffset + pixBinIndexBinaryStringByteLength));
    movingByteOffset += pixBinIndexBinaryStringByteLength;

    // we will be reusing the same block decoder for all the blocks
    var blockDecoder = new PixBlockDecoder();
    var outputCounter = 0;


    var binMeta = pixBinIndexObj;
    var decodedBlocks = [];

    // decoding each block
    for(var i=0; i<pixBinIndexObj.pixblocksInfo.length; i++){
      var blockInfo = pixBinIndexObj.pixblocksInfo[i];
      var pixBlock = input.slice(movingByteOffset, movingByteOffset + blockInfo.byteLength);
      movingByteOffset += blockInfo.byteLength;

      if( verifyChecksum && md5( pixBlock ) !== blockInfo.checksum){
        console.warn("Modality " + (i+1) + "/" + pixBinIndexObj.pixblocksInfo.length + " (" + blockInfo.type + ") could not comply to checksum validation." );
        continue;
      }

      blockDecoder.setInput( pixBlock )
      blockDecoder.run();
      var decodedBlock = blockDecoder.getOutput();

      if( decodedBlock ){
        decodedBlocks.push( decodedBlock )
        outputCounter ++;
      }
    }

    this._output = {
      meta: pixBinIndexObj,
      blocks: decodedBlocks
    }

  }


} /* END of class PixBinDecoder */

export { PixBinDecoder }
