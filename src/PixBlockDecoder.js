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
* A PixBlockDecoder instance is a Filter that takes an ArrayBuffer that is the result
* of a PixBlock compression. This filter ouputs an object of a type inherited from
* PixpipeContainer (Image2D/Image3D/etc.)
* If the data within the block was compressed, it will automatically be decompressed.
* If the data object was composed of several subset (eg. mesh), the subset will be
* retrieved in the same order as the where in the original data
* (no matter if compressed or not).
*
* **Usage**
* - [examples/Image2DToPixblock.html](../examples/Image2DToPixblock.html)
*/
class PixBlockDecoder {
  constructor(){
    this.reset();
  }


  /**
  * reset inputs and inputs
  */
  reset(){
    this._input = null;
    this._output = null;
  }


  /**
  * Specify an input
  * @param {ArrayBuffer} buff - the arraybuffer that contains some data to be deserialized
  */
  setInput( buff ){
    // check input
    if( !(buff instanceof ArrayBuffer) ){
      console.warn("Input should be a valid ArrayBuffer");
      return;
    }
    this._input = buff;
  }


  /**
  * Get the output
  * @return {Object} the output, or null
  */
  getOutput(){
    return this._output;
  }


  /*
  * Launch the decoding
  */
  run(){

    var input = this._input;
    var view = new DataView( input );
    var isLtlt = view.getUint8( 0 );
    var readingByteOffset = 0;

    // get the endianess used to encode the file
    var isLittleEndian = view.getUint8(0)
    readingByteOffset += 1

    // get the length of the string buffer (unicode json) that follows
    var metadataBufferByteLength = view.getUint32(1, readingByteOffset);
    readingByteOffset += 4;

    // get the string buffer
    var strBuffer = input.slice( readingByteOffset, readingByteOffset + metadataBufferByteLength )
    var metadataObj = CodecUtils.ArrayBufferToObject( strBuffer );
    readingByteOffset += metadataBufferByteLength;

    // the data streams are the byte streams when they are converted back to actual typedArrays/Objects
    var dataStreams = []

    for(var i=0; i<metadataObj.byteStreamInfo.length; i++){
      // act as a flag: if not null, it means data were compressed
      var compressedByteLength = metadataObj.byteStreamInfo[i].compressedByteLength

      // meaning, the stream is compresed
      if( compressedByteLength ){
        // fetch the compresed dataStream
        var compressedByteStream = new Uint8Array( input, readingByteOffset, compressedByteLength );

        // inflate the dataStream
        var inflatedByteStream = pako.inflate( compressedByteStream );

        // create a typed array out of the inflated buffer
        var typedArrayConstructor = this._getArrayTypeFromByteStreamInfo(metadataObj.byteStreamInfo[i]);
        var dataStream = new typedArrayConstructor( inflatedByteStream.buffer );

        dataStreams.push( dataStream )
        readingByteOffset += compressedByteLength;

      }
      // the stream were NOT compressed
      else{
        var dataStream = CodecUtils.extractTypedArray(
          input,
          readingByteOffset,
          this._getArrayTypeFromByteStreamInfo(metadataObj.byteStreamInfo[i]),
          metadataObj.byteStreamInfo[i].length
        )

        dataStreams.push( dataStream )
        readingByteOffset += metadataObj.byteStreamInfo[i].byteLength;
      }
    }

    // If data is a single typed array (= not composed of a subset)
    // we get rid of the useless wrapping array
    if( dataStreams.length == 1){
      dataStreams = dataStreams[0]
    }

    this._output = {
      originalBlockType: metadataObj.originalBlockType,
      _data: dataStreams,
      _metadata: metadataObj.containerMeta
    };
  }


  /**
  * Get the array type based on byte stream info.
  * The returned object can be used as a constructor
  * @return {Function} constructor of a typed array
  */
  _getArrayTypeFromByteStreamInfo( bsi ){
    var arrayType = null;

    if( bsi.type === "int" ){
      arrayType = bsi.signed ? "Uint" : "Int"
    }else{
      arrayType = "Float"
    }

    arrayType += bsi.bytesPerElements*8 + "Array";
    var globalObject = CodecUtils.getGlobalObject()
    return ( globalObject[ arrayType ] )
  }


} /* END of class PixBlockDecoder */

export { PixBlockDecoder }
