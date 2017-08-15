/*
* Author    Jonathan Lurie - http://me.jonahanlurie.fr
*
* License   MIT
* Link      https://github.com/jonathanlurie/pixpipejs
* Lab       MCIN - Montreal Neurological Institute
*/


import pako from 'pako';
import { CodecUtils } from 'codecutils';

/**
* A PixBlockEncoder instance is a Filter that takes a PixpipeContainer as input,
* which is the base type for Image2D/Image3D and any other data container used in Pixpipe.
* Then, the update function serializes the data structure (data + metadata) into
* a binary buffer that can be send to a PixBinEncoder (or directly to write a file).
*
* Data can be compressed unsing Pako. To enable this feature, specify
* `.setMetadata("compress", true)` on this filter.
* Please note that metadata are not compressed, only data are.
* Also, compression has some side effects:
* - data from within a block is no longer streamable
* - the datablock is smaller
* - the metadata header is still accessible
*
* **Usage**
* - [examples/Image2DToPixblock.html](../examples/Image2DToPixblock.html)
*/
class PixBlockEncoder {

  constructor(){
    this._compress = false;
    this.reset()
  }


  /**
  * reset inputs and inputs
  */
  reset(){
    this._input = null;
    this._output = null;
  }


  /**
  * Set a boolean to secify if data should be compressed or not
  * @param {Boolean} b - true to compress, false to not compress
  */
  enableDataCompression( b ){
    this._compress = b;
  }


  /**
  * Specify an input to the encoder
  * @param {Object} obj - an object candidate, containing a _data and _metadata attributes
  */
  setInput( obj ){
    if(PixBlockEncoder.isGoodCandidate( obj )){
      this._input = obj;
    }
  }


  /**
  * Get the output
  * @return {Object} the output, or null
  */
  getOutput(){
    return this._output;
  }


  /**
  * Check if the given object is a good intput candidate
  * @param {Object} obj - an object candidate, containing a _data and _metadata attributes
  * @return {Boolean} true if good candidate, false if not
  */
  static isGoodCandidate( obj ){
    if( !obj ){
      console.warn("Input object cannot be null.");
      return false;
    }

    if( !("_metadata" in obj)){
      console.warn("Input object must contain a _metadata object.");
      return false;
    }

    if( !("_data" in obj)){
      console.warn("Input object must contain a _data object.");
      return false;
    }

    var metadata = obj._metadata;
    var data = obj._data;

    // check 1: metadata should not contain cyclic structures
    try{
      JSON.stringify( metadata );
    }catch(e){
      console.warn("The metadata object contains cyclic structures. Cannot be used.");
      return;
    }

    // check 2: metadata should be an Object
    if( !(metadata instanceof Object) ){
      console.warn("The metadata object must be an instance of Object.");
      return;
    }

    // check 3: data should be a typed array or an Array of typed arrays
    if( data instanceof Array ){
      for(var i=0; i<data.length; i++){
        if( !CodecUtils.isTypedArray( data[i] ) ){
          console.warn("The data object must be a typed array or an Array of typed arrays.");
          return;
        }
      }
    }else if( !CodecUtils.isTypedArray( data ) ){
      console.warn("The data object must be a typed array or an Array of typed arrays.");
      return;
    }

    return true;
  }


  /**
  * Launch the encoding of the block
  */
  run(){
    var input = this._input;

    if( !input ){
      console.warn("An input must be given to the PixBlockEncoder.");
      return;
    }


    var compress = this._compress;
    var data = input._data;
    var compressedData = null;

    var byteStreamInfo = [];
    var usingDataSubsets = false;

    // the _data object is an array containing multiple TypedArrays (eg. meshes)
    if( Array.isArray(data) ){
      usingDataSubsets = true;
      compressedData = [];

      // collect bytestream info for each subset of data
      for(var i=0; i<data.length; i++){
        var byteStreamInfoSubset = CodecUtils.getTypedArrayInfo(data[i]);
        // additional compression flag
        byteStreamInfoSubset.compressedByteLength = null;

        if(this._compress){
          var compressedDataSubset = pako.deflate( data[i] );
          byteStreamInfoSubset.compressedByteLength = compressedDataSubset.byteLength;
          compressedData.push( compressedDataSubset );
        }

        byteStreamInfo.push( byteStreamInfoSubset )
      }
    }
    // the _data object is a single TypedArray (eg. Image2D)
    else{
      var byteStreamInfoSubset = CodecUtils.getTypedArrayInfo(data)
      // additional compression flag
      byteStreamInfoSubset.compressedByteLength = null;

      if(this._compress){
        compressedData = pako.deflate( data.buffer );
        byteStreamInfoSubset.compressedByteLength = compressedData.byteLength;
      }

      byteStreamInfo.push( byteStreamInfoSubset )
    }
    // TODO: if it's not an array and not a TypedArray, it could be an object

    // from now, if compression is enabled, what we call data is compressed data
    if(this._compress){
      data = compressedData;
    }

    var pixBlockMeta = {
      byteStreamInfo    : byteStreamInfo,
      originalBlockType : input.constructor.name,
      containerMeta     : input._metadata
    }

    // converting the pixBlockMeta obj into a buffer
    var pixBlockMetaBuff = CodecUtils.objectToArrayBuffer( pixBlockMeta );

    // this list will then be trandformed into a single buffer
    var allBuffers = [
      new Uint8Array( [ + CodecUtils.isPlatformLittleEndian() ] ).buffer, // endianess
      new Uint32Array( [pixBlockMetaBuff.byteLength] ).buffer, // size of the following buff (pixBlockMetaBuff)
      pixBlockMetaBuff, // the buff of metadada
    ]

    // adding the actual data buffer to the list
    if( usingDataSubsets ){
      for(var i=0; i<data.length; i++){
          allBuffers.push( data[i].buffer )
      }
    }else{
      allBuffers.push( data.buffer )
    }

    this._output = CodecUtils.mergeBuffers( allBuffers );
  }


} /* END of class PixBlockEncoder */

export { PixBlockEncoder }
