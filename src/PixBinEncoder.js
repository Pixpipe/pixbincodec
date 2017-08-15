/*
* Author    Jonathan Lurie - http://me.jonahanlurie.fr
*
* License   MIT
* Link      https://github.com/jonathanlurie/pixpipejs
* Lab       MCIN - Montreal Neurological Institute
*/

import pako from 'pako';
import md5 from 'js-md5';
import { CodecUtils } from 'codecutils';
import { PixBlockEncoder } from './PixBlockEncoder.js';

/**
* A PixBinEncoder instance takes an Image2D or Image3D as input with `addInput(...)`
* and encode it so that it can be saved as a *.pixp file.
* An output filename can be specified using `.setMetadata("filename", "yourName.pixp");`,
* by default, the name is "untitled.pixp".
* When `update()` is called, a gzip blog is prepared as output[0] and can then be downloaded
* when calling the method `.download()`. The gzip blob could also be sent over AJAX
* using a third party library.
*
* **Usage**
* - [examples/savePixpFile.html](../examples/savePixpFile.html)
*/
class PixBinEncoder {
  constructor(){
    this._compress = true;
    this.reset();
  }


  /**
  * [static]
  * the first sequence of bytes for a pixbin file is this ASCII string
  */
  static MAGIC_NUMBER(){
    return "PIXPIPE_PIXBIN";
  }


  /**
  * [PRIVATE]
  * reset inputs and inputs
  */
  reset(){
    this._inputs = [];
    this._output = null;
    this._options = {
      madeWith: "pixbincodec_js",
      userObject: null,
      description: null,
    }
  }


  /**
  * Set a boolean to secify if data should be compressed or not
  * @param {Boolean} b - true to compress, false to not compress
  */
  enableDataCompression( b ){
    this._compress = b;
  }


  /**
  * Overwrite one of the default options.
  * @param {String} optionName - one of "madeWith" (default: "pixbincodec_js"), "userObject" (default: null), "description" (default: null)
  */
  setOption( optionName, value ){
    if( optionName in this._options){
      this._options[ optionName ] = value;
    }
  }


  /**
  * Add an input. Multiple inputs can be added.
  * @param {Object} obj - an object that comtain _data and _metadata
  */
  addInput( obj ){
    if(PixBlockEncoder.isGoodCandidate( obj )){
      this._inputs.push( obj );
    }
  }


  /**
  * Get the output
  * @return {ArrayBuffer} the encoded data as a buffer
  */
  getOutput(){
    return this._output;
  }


  /**
  * Launch the encoding
  */
  run(){
    if( !this._inputs.length ){
      console.warn("The encoder must be specified at least one input.");
      return;
    }

    var that = this;
    var today = new Date();
    var isLittleEndian = CodecUtils.isPlatformLittleEndian();
    var blockEncoder = new PixBlockEncoder();

    // this object is the JSON description at the begining of a PixBin
    var pixBinIndex = {
      date: today.toISOString(),
      createdWith: this._options.madeWith,
      description: this._options.description,
      userObject: this._options.userObject,
      pixblocksInfo: []
    }

    // array of binary blocks (each are Uint8Array or ArrayBuffer)
    var pixBlocks = []

    // just a convenient shortcut
    var pixblocksInfo = pixBinIndex.pixblocksInfo;


    this._inputs.forEach(function( input, index ){
      blockEncoder.setInput( input );
      blockEncoder.enableDataCompression( that._compress )
      blockEncoder.run();

      var encodedBlock = blockEncoder.getOutput();

      if( !encodedBlock ){
        console.warn("The input of index " + index + " could not be encoded as a PixBlock.");
        return;
      }

      // adding an entry to the PixBin index
      var pixBinIndexEntry = {
        type        : input.constructor.name,
        description : ( "description" in input._metadata ) ? input._metadata.description : null,
        byteLength  : encodedBlock.byteLength,
        checksum    : md5( encodedBlock ),
      };

      pixblocksInfo.push( pixBinIndexEntry )
      pixBlocks.push( encodedBlock )
    });


    if( !pixBlocks.length ){
      console.warn("No input was compatible for PixBlock encoding.");
    }

    // Building the header ArrayBuffer of the file. It contains:
    // - A ASCII string "pixpipe". 7 x Uint8 of charcodes (7 bytes)
    // - A flag for encoding endianess, 0: big, 1: little. 1 x Uint8 (1 byte)
    // - The byte length of the PixBin meta binary object. 1 x Uint32 (4 bytes)

    // encoding the meta object into an ArrayBuffer
    var pixBinIndexBinaryString = CodecUtils.objectToArrayBuffer(pixBinIndex);
    var magicNumber = PixBinEncoder.MAGIC_NUMBER();

    // the +5 stands for 1 endiannes byte (Uint8) + 4 bytes (1xUint32) of header length
    var fixedHeader = new ArrayBuffer( magicNumber.length + 5 );
    var fixedHeaderView = new DataView( fixedHeader );

    CodecUtils.setString8InBuffer( magicNumber, fixedHeader );
    fixedHeaderView.setUint8( magicNumber.length, (+isLittleEndian))
    fixedHeaderView.setUint32( magicNumber.length + 1, pixBinIndexBinaryString.byteLength, isLittleEndian );

    var allBuffers = [fixedHeader, pixBinIndexBinaryString].concat( pixBlocks )
    this._output = CodecUtils.mergeBuffers( allBuffers )

  }



} /* END of class PixBinEncoder */

export { PixBinEncoder }
