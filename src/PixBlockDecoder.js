/*
* Author    Jonathan Lurie - http://me.jonahanlurie.fr
*
* License   MIT
* Link      https://github.com/jonathanlurie/pixpipejs
* Lab       MCIN - Montreal Neurological Institute
*/

import pako from 'pako';
import { CodecUtils } from 'codecutils';


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

      // create a typed array out of the inflated buffer
      var typedArrayConstructor = this._getDataTypeFromByteStreamInfo(metadataObj.byteStreamInfo[i]);
      
      // meaning, the stream is compresed
      if( compressedByteLength ){
        // fetch the compresed dataStream
        var compressedByteStream = new Uint8Array( input, readingByteOffset, compressedByteLength );

        // inflate the dataStream
        var inflatedByteStream = pako.inflate( compressedByteStream );

        var dataStream = null;
        if( typedArrayConstructor === Object){
          dataStream = CodecUtils.ArrayBufferToObject( inflatedByteStream.buffer  );
        }else{
          dataStream = new typedArrayConstructor( inflatedByteStream.buffer );
        }
        
        dataStreams.push( dataStream )
        readingByteOffset += compressedByteLength;

      }
      // the stream were NOT compressed
      else{
        var dataStream = null;
        if( typedArrayConstructor === Object){

          var objectBuffer = CodecUtils.extractTypedArray(
           input,
           readingByteOffset,
           Uint8Array,
           metadataObj.byteStreamInfo[i].length
         )
          
         dataStream = CodecUtils.ArrayBufferToObject( objectBuffer.buffer );
        }else{
          dataStream = CodecUtils.extractTypedArray(
            input,
            readingByteOffset,
            this._getDataTypeFromByteStreamInfo(metadataObj.byteStreamInfo[i]),
            metadataObj.byteStreamInfo[i].length
          )
        }
      

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
  _getDataTypeFromByteStreamInfo( bsi ){
    var dataType = null;
    var globalObject = CodecUtils.getGlobalObject()

    if( bsi.type === "int" ){
      dataType = bsi.signed ? "Uint" : "Int";
      dataType += bsi.bytesPerElements*8 + "Array";
      
    }else if( bsi.type === "float" ){
      dataType = "Float";
      dataType += bsi.bytesPerElements*8 + "Array";
      var globalObject = CodecUtils.getGlobalObject()
      
    }else if( bsi.type === "object" ){
      dataType = "Object";
    }

    return ( globalObject[ dataType ] )
  }


} /* END of class PixBlockDecoder */

export { PixBlockDecoder }
