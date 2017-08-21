# PixBin codec
To encode data into an ArrayBuffer that uses the PixBin format.

# The PixBin format
The PixBin format is a simple way to serialize Javascript object into a binary ArrayBuffer and, eventually, into a file you can save on your computer. Originally it was created so that [Pixpipejs](https://github.com/Pixpipe/pixpipejs) can save a state of a piece of data and late, be injected agin into a pipeline for further processing. In the context of Pixpipejs, this piece of data could be an Image2D, an Image3D, a LineString, etc. In the end, it's just a Javascript Object!  

To know more about the format, read this [in-depth description](pixbinformat.md).

## Advantages
- Optimized for numerical data
- Still a generic store-what-you-want format
- Is multimodality, a bit like an archive, you can store multiple blocks inside
- Can handle as many metadata as you need, per block **and** at the parent level
- Data of each block are *zlib* compressed (lossless) *- optional*
- Streamable over blocks, since each block of data is compressed independently
- Perform checksum validation on each block to guaranty data integrity *- optional*
- Provide an easy-to-read header with an index of all the blocks (without having to read/decode those blocks)
- Is a binary format
- Easy to write a parser for

# Examples
See the `examples` directory for the source, or:
- [A short example of coding - decoding](https://pixpipe.github.io/pixbincodec/examples/testPixBin.html)
- [A more extensive example of coding - creating a file - decoding](https://pixpipe.github.io/pixbincodec/examples/testPixBinDownload.html)

# Requirements
In order to be serialize into the PixBin format, a JS object must contain:
- a `_data` attribute, no matter what it contains
- a `_metadata` attribute, no matter what it contains

**Notice:** since this format is intended to encode numerical data like pixel arrays or position arrays, the encoding the `_data` object will be optimized in the following cases:
1. `_data` is a [typed array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays). There is a **single stream** to encode (case 1).
2. `_data` is an `Array` of [typed arrays](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Typed_arrays). There are **several streams** to encode (case 2).

In those cases, the data will directly be encoded as low level types rather than being serialized into a more descriptive language. This will also result in smaller files.

The third case, if you chose that `_data` is an `Object` (or `{}`), then it will be serialized (see [Object serialization](#object-serialization)).  There is a **single stream** to encode (case 3).

# Code sample
