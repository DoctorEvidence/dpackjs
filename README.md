<a href="https://dev.doctorevidence.com/"><img src="./assets/powers-dre.png" width="203" /></a>

DPack is a very compact binary format for serializing data structures, designed for efficient, high-performance serialization/parsing, and optimized for web use. For common large data structures in applications, a DPack file is typically about 70% smaller than JSON (and about 60% smaller than MsgPack), and can be parsed about 70% faster (40% less time) than JSON and other formats. DPack has several key features:
* Uses internal referencing and reuse of structures, properties, values, and objects for remarkably compact serialization and fast parsing.
* Defined as a valid unicode character string, which allows for single-pass text decoding for faster and simpler decoding (particulary in browser), support across older browsers, and ease of manipulation as a character string. It  can also be encoded in UTF-8, UTF-16, or any ASCII compatible encoding.
* Supports a wide range of types including strings, decimal-based numbers, booleans, objects, arrays, dates, maps, sets, and user-provided classes.
* Supports positionally mapped object properties for lazy evaluation of paths for faster access to data without parsing entire data structures (useful for storing, querying, and indexing data in databases).
* Supports referencing of objects which can be used to reorder serialization and reuse objects.
* Optimized to compress well with Huffman/Gzip encoding schemes

In addition this DPack library features:
* Streaming, progressive parsing in the browser, so data can be parsed during download instead of waiting until it completed.
* Asynchronous, progressive streaming of data from Node, utilizing back-pressure to load and stream data while miminizing memory/resource consumption.
* Less than 15KB minimized (5KB gzipped).

## Intended Use

DPack is designed for very compact serialization and fast parsing with a wide range of types and encodings to support a broad range of applications, including efficient database storage, and efficient network data transfer. However, there are some caveats to consider. In JavaScript, DPack serialization is not quite as fast as `JSON.stringify` (about 25% slower for large data structures). If your application is primarily doing serialization, this may not be an optimal choice. Also, DPack leverage reuse of data property definitions to acheive its compact format. For very small data structures, or data structures with very little structural consistency, DPack's advantages may be minimized or non-existent. However, many, if not most applications, with larger data structures, with the entire process of serialization, compression, caching, network transfer, decoding, and progressive parsing taken into consideration, DPack can provide substantial performance benefits.

### gzip
One particular question in regards to data size and performance is combining serialization with gzip/deflate compression. Is DPack's compact format really helpful compared to JSON + gzip? The short answer is yes. It is true to that gzip works by eliminating much of the redundancy in JSON, which DPack also does, so a DPack message/file simply will not have as much redundancy to compress away with gzip. However, in our tests, DPack+gzip is still smaller than JSON+gzip, typically by about 10% (and also worth considering is that MsgPack+gzip is actually typically *larger* than JSON+gzip). This is because DPack is actually doing compression at a more structural level, and uses common character encodings, which actually complements gzip's string level (RLE) and byte level (Huffman encoding) compression. And furthermore, because there simply is much *less* to compress, DPack+gzip serialization/compression is actually about 25% *faster* than JSON+gzip serialization/compression, because DPack substantially decreases the workload of gzipping. For more performance-weighted designed, it is also worth considering using lower gzip compression level settings since the data is already much smaller (such 3 or 4 instead of the default of 6), which still will provide a more compact compression than a JSON+gzip alternative, and provide even better performance.

# Using DPack

To use DPack, install it:
```
npm install dpack
```
Require or import it:
```
import { serialize, parse } from 'dpack'
```
And start serializing or parsing your data:
```
let serialized = serialize(myData)
let copyOfMyData = parse(serialized)
```

## Fetching in the Browser
This DPack library also supports progressive parsing through a minimal `fetch` API. This loading mechanism means that DPack will parse messages *while* they are downloading. For large data structures, you don't have to wait for the download to complete before starting an additional expensive step of parsing, but by the time the last byte comes in, most of the file will have already been parsed. The progressively parsed data is also available for interaction. For example, could show list of all the items in your data structure that have been downloaded, or count the items to show a progress bar. Using this feature approximately follows the standard fetch API:
```
import { fetch } from 'dpack'
fetch('my/dpack-data', {
	onProgress(data) {
		// all the data that has been downloaded so far is parsed, and accessible here as it downloads
	}
}).then(response => response.dpack()).then(data => {
	// finished downloading, full data available
})
```

## Streams

### Asynchronous Streaming

## Specification
The basic entity in the DPack is a block which consists of a `type` which consists of 2 bit (unsigned) integer and an accompanying number which consists of up to 40 bit (unsigned) integer. This is serialized with 1 to 6 bytes. All bytes have an initial 0 bit (only 0 - 127 byte range are used). The second bit is always a "stop" bit. A one means this is the last byte, a zero means additional bytes are part of the block. In the first byte, The next two bits (3rd and 4th) represent the `type` of the block. The remaining bits, the first four bits of the first byte, and all remaining bytes (up to and including a byte with a stop bit) are used to serialize the accompanying number, which is interpreted by big endian bytes/bits.
For example:
0 1 0 1 0 0 1 0 - Stop bit is set (1), type (0 1) is 1, and accompanying number (0 0 1 0) is 2.
0 0 1 0 0 0 0 1 - Stop bit is not set (0), type (1 0) is 2, bits (0 0 0 1) will be added to next byte:
 next: 0 1 0 0 0 1 0 0 - Stop bit is set. Combined bits (0 0 0 1  0 0 0 1 0 0) make 68 the accompanying number.

extension entity:
1 1 0 t t t t stop-bit  1 0 t t n n n n

There may be up to 8 bytes, which accomodates up to 46 bits for the accompanying number, therefore it must be an unsigned integers under 2^46.

Some types will use the accompanying number to specify the length of a string immediately following the block. When a string is to be read, the number specifies the number of characters to be including in the string, after which the next block can be immediately read. The length of the string is not bytes, but basic multiplane characters. Any supplemental plane should be counted as two characters (surrogates) should be counted as two characters (a pair). In other words, a string length is defined by its UTF-16 encoding (though it is serialized in UTF-8 in DPack).

A byte of 0 should always to parsed as a null (in all reading modes).

## Type and Reading Mode
The `type` is combined with the reading mode to determine the type of the value being parsed. The following reading modes and types are specified. Decoding should always start in open mode:

### Open Mode
In open mode, `type` is interpreted:
type 0: The value is determined by the accompanying number:
	0 - null
	1 - false
	2 - true
	3 - undefined

	8 - object - read the next block in object mode
	9 - string - read the next block in string mode
	10 - open - read  the next block in open mode (no-op)
	11 - extended type - read the next block in open mode to determine type, and block after with extension reader
	12 - Value with identifier. Read the next entity as a number, in open mode, to determine the id, and the next data in open mode)
	13 - Begin document and define length of next section data. Read the next block in open mode as a number to determine length, and then the next block after that in open mode to determine value
	14 - End document
	15 - Library import

type 1: The accompanying number is the actual parsed value (an unsigned integer)
type 2: The accompanying number is the length of as string, which should be serialized as a number. For example, a string could be "-2.32".
type 3: And array of values, each to be successively read in open mode. The accompanying number specifies the number of values in the array.
4(8): object (read next block in object mode) with metadata
5(9): string (read next block in string mode) with metadata
6(10): open (read next block in open mode) with metadata

### Object Mode
In object mode, `type` is interpreted:
type 0 - object identify/reference - Identifies this objects, connecting it to an identity, that may be defined or used elsewhere. The next block should be read in object mode to read any properties assigned to immediately.
type 1 - Object with inline property structure. An object/map is serialized and will be parsed by first reading a structure definition of the properties, and then the values of the property. The accompanying number defines the number of properties (and values). The property structure is parsed in property mode, with the given number of properties, which define the property names and types that will be created on the parsed object. This is followed by the property values, in the same order and position as the property definitions. The corresponding property definition defines which read mode to use for each value (i.e. if the first property defines string type, the first value should be read in string mode).
type 2 - Object with structure reference. The accompanying number is a reference to a previously defined property structure. The structure reference is followed by the values to parsed and assigned to the object based on the position and type as defined in the referenced structure. The referenced structure is a back-reference, and is found by counting sequentially in reverse through the DPack document/file/stream by the inline-defined structures. For example, if the accompanying number is 1, then the last (most recently) defined property structure before this point in the document, is the referenced structure. A number of 2 would be the second to last (0 never used as a back-reference, it should be parsed as null).
type 3: And array of objects, each to be successively read in object mode. The accompanying number specifies the number of objects in the array.

### String Mode
In string mode, `type` is interpreted:
0: inline string, non-referenceable
1: inline string, referenceable
2: string back reference
type 3: And array of strings, each to be successively read in string mode. The accompanying number specifies the number of strings in the array.
string length = num

### Property Mode:
In property mode, `type` is interpreted:
0: property reference
1: object type with string key (value defines string length)
2: string type...
3: open type...
4(8): object type with string key (value defines string length) with metadata
5(9): string type with string key (value defines string length) with metadata
6(10): open type with string key (value defines string length) with metadata
extended unicode - for metadata



buffers?
document specified
documents (lazy evaluation)?
property metadata
extensions
dates

object with binary key positions (from here):
# keys | key position as defined above | rest of object


properties:
independent object serializations can be context-free and safely inserted
can be lazily evaluated (at binary level)
is valid utf-8 (can be evaluated as utf-8 as the first step, and should be unless lazy evaluation is necessary)
supports property metadata and types including boolean, string, number, decimal, object, arrays, dates, binary.
compact, fast
can be progressively evaluated

