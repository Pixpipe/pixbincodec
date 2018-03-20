/*
* Author    Jonathan Lurie - http://me.jonahanlurie.fr
*
* License   MIT
* Link      https://github.com/jonathanlurie/pixpipejs
* Lab       MCIN - Montreal Neurological Institute
*/


import md5 from 'js-md5';
import codecutils from 'codecutils';
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
    this._input = null;
    this._output = null;
    this._binMeta = null;
    this._parsingInfo = {
      offsetToReachFirstBlock: -1,
      isLittleEndian: -1,
    }

    this._decodedBlocks = {};
    this._isValid = false;
    this.reset();
  }


  /**
  * Specify an input
  * @param {ArrayBuffer} buff - the input
  */
  setInput( buff ){
    this.reset();

    if( buff instanceof ArrayBuffer ){
      this._input = buff;
      this._isValid = this._parseIndex();
    }
  }


  /**
  * To be called after setInput. Tells if the buffer loaded is valid or not.
  * @return {Boolean} true if valid, false if not.
  */
  isValid(){
    return this._isValid;
  }

  /**
  * Get the the decoded output
  * @return {Object} a decoded object
  */
  getOutput(){
    return this._output;
  }


  /**
  * Get the number of blocks encoded in this PixBin file
  * @return {Number}
  */
  getNumberOfBlocks(){
    return this._binMeta.pixblocksInfo.length;
  }


  /**
  * Get the creation date of the file in the ISO8601 format
  * @return {String} the data
  */
  getBinCreationDate(){
    return this._binMeta.date;
  }


  /**
  * Get the description of the PixBin file
  * @return {String} the description
  */
  getBinDescription(){
    return this._binMeta.description;
  }


  /**
  * The userObject is a generic container added to the PixBin. It can carry all sorts of data.
  * If not specified during encoding, it's null.
  * @return {Object} the userObject
  */
  getBinUserObject(){
    return this._binMeta.userObject;
  }


  /**
  * Get the description of the block at the given index
  * @param {Number} n - the index of the block
  * @return {String} the description of this block
  */
  getBlockDescription( n ){
    if( n<0 || n >= this.getNumberOfBlocks() ){
      console.warn("The block index is out of range.");
      return null;
    }
    return this._binMeta.pixblocksInfo[n].description;
  }


  /**
  * Get the original type of the block. Convenient for knowing how to rebuild
  * the object in its original form.
  * @param {Number} n - the index of the block
  * @return {String} the type ( comes from constructor.name )
  */
  getBlockType( n ){
    if( n<0 || n >= this.getNumberOfBlocks() ){
      console.warn("The block index is out of range.");
      return null;
    }
    return this._binMeta.pixblocksInfo[n].type;
  }


  /**
  * reset I/O and data to query
  */
  reset(){
    this._isValid = false;
    this._input = null;
    this._output = null;
    this._binMeta = null;
    this._parsingInfo = {
      offsetToReachFirstBlock: -1,
      isLittleEndian: -1,
    }
    this._decodedBlocks = {};
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
  * [PRIVATE]
  *
  */
  _parseIndex(){
    var input = this._input;

    if( !input ){
      console.warn("Input cannot be null");
      return false;
    }

    var inputByteLength = input.byteLength;
    var magicNumberToExpect = PixBinEncoder.MAGIC_NUMBER();

    // control 1: the file must be large enough
    if( inputByteLength < (magicNumberToExpect.length + 5) ){
      console.warn("This buffer does not match a PixBin file.");
      return false;
    }

    var view = new DataView( input );
    var movingByteOffset = 0;
    var magicNumber = codecutils.CodecUtils.getString8FromBuffer(input, magicNumberToExpect.length )

    // control 2: the magic number
    if( magicNumber !== magicNumberToExpect){
      console.warn("This file is not of PixBin type. (wrong magic number)");
      return false;
    }

    movingByteOffset = magicNumberToExpect.length;
    var isLittleEndian = view.getUint8(movingByteOffset);

    // control 3: the endianess must be 0 or 1
    if(isLittleEndian != 0 && isLittleEndian != 1){
      console.warn("This file is not of PixBin type. (wrong endianess code)");
      return false;
    }

    movingByteOffset += 1;
    var pixBinIndexBinaryStringByteLength = view.getUint32( movingByteOffset, isLittleEndian );
    movingByteOffset += 4;
    var pixBinIndexObj = codecutils.CodecUtils.ArrayBufferToObject( input.slice(movingByteOffset, movingByteOffset + pixBinIndexBinaryStringByteLength));
    movingByteOffset += pixBinIndexBinaryStringByteLength;

    this._parsingInfo.offsetToReachFirstBlock = movingByteOffset;
    this._parsingInfo.isLittleEndian = isLittleEndian;
    this._binMeta = pixBinIndexObj;

    return true;
  }


  /**
  * Fetch a block at the given index. The first time it called on a block,
  * this block will be read from the stream and decoded.
  * If a block is already decoded, it will be retrieved as is without trying to
  * re-decode it, unless `forceDecoding` is `true`.
  * @param {Number} n - the index of the block to fetch
  * @param {Boolean} forceDecoding - force the decoding even though it was already decoded
  * @return {Object} the decoded block, containing `_data_`, `_metadata` and `originalBlockType`
  */
  fetchBlock( n , forceDecoding=false ){
    var nbBlocks = this.getNumberOfBlocks()
    if( n<0 || n >= nbBlocks ){
      console.warn("The block index is out of range.");
      return null;
    }

    if( n in this._decodedBlocks && !forceDecoding){
      return this._decodedBlocks[ n ];
    }

    var offset = this._parsingInfo.offsetToReachFirstBlock;

    for(var i=0; i<n; i++){
      offset += this._binMeta.pixblocksInfo[i].byteLength;
    }

    var blockInfo = this._binMeta.pixblocksInfo[n];
    var pixBlockBuff = this._input.slice(offset, offset + blockInfo.byteLength);

    if( this._verifyChecksum && md5( pixBlockBuff ) !== blockInfo.checksum){
      console.warn("The block #" + n + " is corrupted.");
      return null;
    }

    var blockDecoder = new PixBlockDecoder();
    blockDecoder.setInput( pixBlockBuff )
    blockDecoder.run();
    var decodedBlock = blockDecoder.getOutput();

    if( !decodedBlock ){
      console.warn("The block #" + n + " could not be decoded.");
      return null;
    }

    this._decodedBlocks[ n ] = decodedBlock;
    return decodedBlock;
  }


} /* END of class PixBinDecoder */

export { PixBinDecoder }
