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

    // primer, part 1
    // get the endianess used to encode the file
    var isLittleEndian = view.getUint8(0)
    readingByteOffset += 1

    // primer, part 2
    // get the length of the string buffer (unicode json) that follows
    var pixBlockHeaderBufferByteLength = view.getUint32(1, readingByteOffset);
    readingByteOffset += 4;

    // get the string buffer
    var pixBlockHeaderBuffer = input.slice( readingByteOffset, readingByteOffset + pixBlockHeaderBufferByteLength )
    var pixBlockHeader = CodecUtils.ArrayBufferToObject( pixBlockHeaderBuffer );
    readingByteOffset += pixBlockHeaderBufferByteLength;
    
    // fetching the metadata
    var metadataBuffer = input.slice( readingByteOffset, readingByteOffset + pixBlockHeader.metadataByteLength );
    var metadataObject = CodecUtils.ArrayBufferToObject( metadataBuffer );
    readingByteOffset += pixBlockHeader.metadataByteLength;
    
    // the data streams are the byte streams when they are converted back to actual typedArrays/Objects
    var dataStreams = []

    for(var i=0; i<pixBlockHeader.byteStreamInfo.length; i++){
      // act as a flag: if not null, it means data were compressed
      var compressedByteLength = pixBlockHeader.byteStreamInfo[i].compressedByteLength

      // create a typed array out of the inflated buffer
      var dataStreamConstructor = this._getDataTypeFromByteStreamInfo(pixBlockHeader.byteStreamInfo[i]);
      
      // know if it's a typed array or a complex object
      var isTypedArray = pixBlockHeader.byteStreamInfo[i].isTypedArray;
      
      // meaning, the stream is compresed
      if( compressedByteLength ){
        // fetch the compresed dataStream
        var compressedByteStream = new Uint8Array( input, readingByteOffset, compressedByteLength );

        // inflate the dataStream
        var inflatedByteStream = pako.inflate( compressedByteStream );

        var dataStream = null;
        /*
        if( dataStreamConstructor === Object){
          dataStream = CodecUtils.ArrayBufferToObject( inflatedByteStream.buffer  );
        }else{
          dataStream = new dataStreamConstructor( inflatedByteStream.buffer );
        }
        */
        
        if( isTypedArray ){
          dataStream = new dataStreamConstructor( inflatedByteStream.buffer );
        }else{
          dataStream = CodecUtils.ArrayBufferToObject( inflatedByteStream.buffer  );
        }
        
        dataStreams.push( dataStream )
        readingByteOffset += compressedByteLength;

      }
      // the stream were NOT compressed
      else{
        var dataStream = null;
        if( dataStreamConstructor === Object){

          var objectBuffer = CodecUtils.extractTypedArray(
           input,
           readingByteOffset,
           Uint8Array,
           pixBlockHeader.byteStreamInfo[i].length
         )
          
         dataStream = CodecUtils.ArrayBufferToObject( objectBuffer.buffer );
        }else{
          dataStream = CodecUtils.extractTypedArray(
            input,
            readingByteOffset,
            this._getDataTypeFromByteStreamInfo(pixBlockHeader.byteStreamInfo[i]),
            pixBlockHeader.byteStreamInfo[i].length
          )
        }
      

        dataStreams.push( dataStream )
        readingByteOffset += pixBlockHeader.byteStreamInfo[i].byteLength;
      }
    }

    // If data is a single typed array (= not composed of a subset)
    // we get rid of the useless wrapping array
    if( dataStreams.length == 1){
      dataStreams = dataStreams[0]
    }

    this._output = {
      originalBlockType: pixBlockHeader.originalBlockType,
      _data: dataStreams,
      _metadata: metadataObject
    };
  }


  /**
  * Get the array type based on byte stream info.
  * The returned object can be used as a constructor
  * @return {Function} constructor of a typed array
  */
  _getDataTypeFromByteStreamInfo( bsi ){
    var dataType = "Object";
    var globalObject = CodecUtils.getGlobalObject()

    if( bsi.type === "int" ){
      dataType = bsi.signed ? "Uint" : "Int";
      dataType += bsi.bytesPerElements*8 + "Array";
      
    }else if( bsi.type === "float" ){
      dataType = "Float";
      dataType += bsi.bytesPerElements*8 + "Array";
      var globalObject = CodecUtils.getGlobalObject()
      
    }

    return ( globalObject[ dataType ] )
  }


} /* END of class PixBlockDecoder */

export { PixBlockDecoder }
