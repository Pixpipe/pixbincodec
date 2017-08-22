/*
* Author    Jonathan Lurie - http://me.jonahanlurie.fr
*
* License   MIT
* Link      https://github.com/jonathanlurie/pixpipejs
* Lab       MCIN - Montreal Neurological Institute
*/


import pako from 'pako';
import { CodecUtils } from 'codecutils';

// list of different kinds of data we accept as input
const dataCases = {
  invalid: null,  // the data is not compatible (Number, String)
  typedArray: 1,  // the data is compatible, as a typed array
  arrayOfTypedArrays: 2, // the data is compatible, as an array of typed array
  complexObject: 3 // a complex object is also compatible (can be a untyped array)
}


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
    this._inputCase = null;
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
    this._inputCase = PixBlockEncoder.isGoodCandidate( obj );
    if(this._inputCase){
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

    // check: metadata should not contain cyclic structures
    try{
      JSON.stringify( metadata );
    }catch(e){
      console.warn("The metadata object contains cyclic structures. Cannot be used.");
      return false;
    }
    
    var inputCase = PixBlockEncoder.determineDataCase( data );
    
    // testing the case based on the kinf of data we want to input
    if( inputCase === dataCases.invalid ){
      console.warn("The input is invalid.");
    }

    return inputCase;
  }


  /**
  * Launch the encoding of the block
  */
  run(){
    var input = this._input;

    if( !input || !this._inputCase ){
      console.warn("An input must be given to the PixBlockEncoder.");
      return;
    }

    var compress = this._compress;
    var data = input._data;
    var compressedData = null;

    var byteStreamInfo = [];
    var usingDataSubsets = false;

    switch (this._inputCase) {
      
      // The input is a typed array ********************************
      case dataCases.typedArray:
        {
          var byteStreamInfoSubset = CodecUtils.getTypedArrayInfo(data)
          // additional compression flag
          byteStreamInfoSubset.compressedByteLength = null;

          if(this._compress){
            compressedData = pako.deflate( data.buffer );
            byteStreamInfoSubset.compressedByteLength = compressedData.byteLength;
          }

          byteStreamInfo.push( byteStreamInfoSubset )
        }
        break;
        
        
      // The input is an Array of typed arrays *********************
      case dataCases.arrayOfTypedArrays:
        {
          usingDataSubsets = true;
          compressedData = [];

          // collect bytestream info for each subset of data
          for(var i=0; i<data.length; i++){
            var byteStreamInfoSubset = CodecUtils.getTypedArrayInfo(data[i]);
            // additional compression flag
            byteStreamInfoSubset.compressedByteLength = null;

            if(this._compress){
              var compressedDataSubset = pako.deflate( data[i].buffer );
              byteStreamInfoSubset.compressedByteLength = compressedDataSubset.byteLength;
              compressedData.push( compressedDataSubset );
            }

            byteStreamInfo.push( byteStreamInfoSubset )
          }
        }
        break;
        
      // The input is an Array of typed arrays *********************
      case dataCases.complexObject:
        {
          
          //console.log("Type: " + data.constructor.name );
          var dataType = data.constructor.name;
          
          // we want to avoid typed arrays to be attributes into data, so we are
          // replacing all of them by regular Arrays
          var dataWithNotTypedArrays = CodecUtils.replaceTypedArrayAttributesByArrays( data )
          
          // replace the original data object with this uncompressed serialized version.
          // We wrap it into a Uint8Array so that we can call .buffer on it, just like all the others
          data = new Uint8Array( CodecUtils.objectToArrayBuffer( data ) );
          
          var byteStreamInfoSubset = { 
            type: dataType,
            compressedByteLength: null,
            length: data.byteLength
          }
          
          if(this._compress){
            compressedData = pako.deflate( data );
            byteStreamInfoSubset.compressedByteLength = compressedData.byteLength;
          }

          byteStreamInfo.push( byteStreamInfoSubset );
        }
        break;
        
      default:
        console.warn("A problem occured.");
        return;
    }

    // from now, if compression is enabled, what we call data is compressed data
    if(this._compress){
      data = compressedData;
    }

    // the metadata are converted into a buffer
    var metadataBuffer = CodecUtils.objectToArrayBuffer( input._metadata );

    var pixBlockHeader = {
      byteStreamInfo     : byteStreamInfo,
      originalBlockType  : input.constructor.name,
      metadataByteLength : metadataBuffer.byteLength
    }

    // converting the pixBlockHeader obj into a buffer
    var pixBlockHeaderBuff = CodecUtils.objectToArrayBuffer( pixBlockHeader );

    // this list will then be transformed into a single buffer
    var allBuffers = [
      // primer, part 1: endianess
      new Uint8Array( [ + CodecUtils.isPlatformLittleEndian() ] ).buffer,
      // primer, part 2: size of the header buff
      new Uint32Array( [pixBlockHeaderBuff.byteLength] ).buffer, 
      
      // the header buff
      pixBlockHeaderBuff, 
      
      // the metadata buffer
      metadataBuffer
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
  
  
  /**
  * [STATIC]
  * Give in what case we fall when we want to use this data.
  * Cases are described at the top
  * @param {Whatever} data - a piec of data, object, array, typed array...
  * @return {Number} the case
  */
  static determineDataCase( data ){
    if( data instanceof Object ){
      if( CodecUtils.isTypedArray( data ) )
        return dataCases.typedArray;
        
      if( data instanceof Array )
        if(data.every( function(element){ return CodecUtils.isTypedArray(element) }))
          return dataCases.arrayOfTypedArrays;
        
      return dataCases.complexObject; 
    }else{
      return dataCases.invalid;
    }
  }


} /* END of class PixBlockEncoder */

export { PixBlockEncoder }
