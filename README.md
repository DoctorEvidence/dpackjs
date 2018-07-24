dpack is a very compact binary format for serializing data structures, designed for efficient, high-performance serialization/parsing, and optimized for web use. For common large data structures in applications, a dpack file is often much smaller than JSON (and much smaller than MsgPack as well), and can be parsed about faster than JSON and other formats. dpack leverages structural reuse to reduce size, and size and performance differences can very significantly depending the on the size, homogeneity, and structure of the incoming data, but in our measurements across different applications we often see 3 to 5 times smaller files for large structures like our study data or Jira issue lists, but very small objects might see little changes. Likewise, dpack may perform 2 to 3 times as fast as JSON parser for large data structures with consistent object structures, but may have little difference in very small structures. dpack has several key features:
* Uses internal referencing and reuse of structures, properties, values, and objects for remarkably compact serialization and fast parsing.
* Defined as a valid unicode character string, which allows for single-pass text decoding for faster and simpler decoding (particulary in browser), support across older browsers, and ease of manipulation as a character string. It  can also be encoded in UTF-8, UTF-16, or any ASCII compatible encoding.
* Supports a wide range of types including strings, decimal-based numbers, booleans, objects, arrays, dates, maps, sets, and user-provided classes/types.
* Supports positionally mapped object properties for lazy evaluation of paths for faster access to data without parsing entire data structures (useful for storing, querying, and indexing data in databases).
* Supports referencing of objects which can be used to reorder serialization and reuse objects.
* Optimized to compress well with Huffman/Gzip encoding schemes

In addition this dpack library features:
* Streaming, progressive parsing in the browser, so data can be parsed during download instead of waiting until it completed.
* Asynchronous, progressive streaming of data from Node, utilizing back-pressure to load and stream data while miminizing memory/resource consumption, with support for lazy-loaded resources.
* Less than 15KB minimized (5KB gzipped).

## Intended Use

dpack is designed for very compact serialization and fast parsing with a wide range of types and encodings to support a broad range of applications, including efficient database storage, and efficient network data transfer. However, there are some caveats to consider. In JavaScript, dpack serialization is not quite as fast as `JSON.stringify` (about 25% slower for large data structures). If your application is primarily doing serialization, this may not be an optimal choice. Also, dpack leverage reuse of data property definitions to acheive its compact format. For very small data structures, or data structures with very little structural consistency, dpack's advantages may be minimized or non-existent. However, many, if not most applications, with larger data structures, with the entire process of serialization, compression, caching, network transfer, decoding, and progressive parsing taken into consideration, dpack can provide substantial performance benefits.

### gzip
One particular question in regards to data size and performance is combining serialization with gzip/deflate compression. Is dpack's compact format really helpful compared to JSON + gzip? The short answer is yes. It is true to that gzip works by eliminating much of the redundancy in JSON, which dpack also does, so a dpack message/file simply will not have as much redundancy to compress away with gzip. However, in our tests, dpack+gzip is still smaller than JSON+gzip, typically by about 10% (and also worth considering is that MsgPack+gzip is actually typically *larger* than JSON+gzip). This is because dpack is actually doing compression at a more structural level, and uses common character encodings, which actually complements gzip's string level (RLE) and byte level (Huffman encoding) compression. And furthermore, because there simply is much *less* to compress, dpack+gzip serialization/compression is actually about 25% *faster* than JSON+gzip serialization/compression, because dpack substantially decreases the workload of gzipping. For more performance-weighted designed, it is also worth considering using lower gzip compression level settings since the data is already much smaller (such 3 or 4 instead of the default of 6), which still will provide a more compact compression than a JSON+gzip alternative, and provide even better performance.

# Using dpack

To use dpack, install it:
```
npm install dpack
```
Require or import it:
```
const { serialize, parse } = require('dpack');
```
And start serializing or parsing your data:
```
let serialized = serialize(myData);
let copyOfMyData = parse(serialized);
```
The `serialize` function accepts a value (object, array, string, etc.), and will return a `Buffer` in node or a string in the browser. The `parse` function accepts a string or Buffer and returns the parsed data. The following types of data can be serialized, and parsed back into the same type:
* Objects - Any plain object
* Arrays
* Strings
* Numbers (including Infinity, -Infinity), encoded in decimal format
* Boolean
* null
* Map
* Set
* Date
* User added types (see section below)

## Fetching in the Browser
This dpack library also supports progressive parsing through a minimal `fetch` API. This loading mechanism means that dpack will parse messages *while* they are downloading. For large data structures, you don't have to wait for the download to complete before starting an additional expensive step of parsing, but by the time the last byte comes in, most of the file will have already been parsed. The progressively parsed data is also available for interaction. For example, could show list of all the items in your data structure that have been downloaded, or count the items to show a progress bar. Using this feature approximately follows the standard fetch API:
```
const { fetch } = require('dpack');
fetch('my/dpack-data', {
	onProgress(data) {
		// all the data that has been downloaded so far is parsed, and accessible here as it downloads
	}
}).then(response => response.dpack()).then(data => {
	// finished downloading, full data available
});
```

## Options
Options can be provided as a second argument to `parse` or `serialize`. The `Options` constructor provided by dpack can be used to create options that define extended types for serialization and parsing.

### Extended Types
Additional user types can be registered with dpack for serializing and parsing. For default object serialization and parsing of custom user types, simply add your class/constructor to the options with `addExtension(Class)`:
```
const { Options, serialize, parse } = require('dpack');

class Greeting {
	constructor(target) {
		this.target = target
	}
	printGreeting() {
		console.log('Hello, ' + this.target)
	}
}
let options = new Options()
options.addExtension(Greeting)
let serialized = serialize({ myGreeting: new Greeting('World')}, options)
let data = parse(serialized, options)
data.myGreeting.printGreeting() // prints "Hello, World"
```

## Streams
The dpack library provides Node transforming streams for streamed parsing and serialization of data. To create a serializing stream, and write a data structure, you can write:
```
const { createSerializeStream } = require('dpack');
var stream = createSerializeStream();
stream.pipe(targetStream) // this could be an HTTP response, or other network stream
stream.write(data) // write a data structure, and it will be serialized
stream.end()
```
Likewise, we can read do streamed parsing:
```
const { createParseStream } = require('dpack');
var stream = createParseStream();
inputStream.pipe(stream); // this could be an HTTP request, WebSocket, or other network stream
stream.on('data', (data) => {
	// when data is received
});
```
### Asynchronous/Lazy Streaming
A serializing stream can also stream data structures that may contain embedded data that is asynchronously or lazily loaded. This can be a powerful way to leverage Node's backpressure functionality to defer loading embedded data until network buffers are ready to consume them. This is accomplished by including `then`able data. A promise can be included in your data, or custom `then`able. For example:
```
var stream = createSerializeStream();
var responseData = {
	someData: fetch('/some/url') // when serializing, dpack will pause at this point, and wait for the promise to resolve
}
stream.write(data) // write the data structure (will pause as necessary for async data)
```
Here is an example of using a custom `then`-able, where dpack will wait to call `then` for each object until there is no back pressure, ensuring that data is not loaded from a database until network buffers are ready to consume the data:
```
var stream = createSerializeStream();
var data = listOfDatabaseIdsToSend.map(id => {
	then(callback) {
		// this will be called by dpack when the stream is waiting for more data to send
		callback(retrieveDataFromDatabase(id)) // retrieve data from database
	}
});
stream.write(data); // write the data structure (will pause and resume data handling both async incoming data and backpressure of outgoing data)
```
Options can also be provided as argument to `createParseStream` or `createSerializeStream`.

## Blocks
Blocks are the basic container of the structures and properties that are reused for compact serialization of data in dpack. However, a dpack file or stream can be broken up into multiple blocks that can be lazily evaluated. This can be particularly valuable for interaction with binary data from database where eagerly parsing an entire data structure may be unnecessary and expensive for querying or indexing data.

### Lazy Parsing/Evaluation
The dpack libary supports lazy parsing using the `parseLazy` variant of `parse`. This function will return `Proxy` that is mapped to the serialized data, that will parse/evaluate the encoded data when any property is accessed:
```
const { parseLazy } = require('dpack')
var parsed = parseLazy(serializedData) // no immediate parsing, can return almost immediately
// parsed is mapped to serializedData, but won't be parsed until data is accessed:
parsed.someProperty // parsing is now performed
parsed.otherProperty // parising has already been performed on the root block and cached
```
Blocks can be embedded in the data structure so that lazy parsing/evaluation can continue to be deferred as child objects are accessed. Blocks can be defined using the `asBlock` function:
```
const { parseLazy, serialize, asBlock } = require('dpack')
let data = {
	category: 'Small data',
	bigData: asBlock(bigDataStructure),
	smallObject: {}
};
let serialized = serialize(data);
let parsed = parseLazy(serialized); // root block is deferred
let category = parsed.category; // root block is parsed, but bigData is *not* parsed and doesn't need to be until accessed
```
Because the object in the `bigData` property has been defined in a sub-block, it does not need to parsed until one of its properties is accessed, this separation can provide substantial performance benefits for accessing a property like `category` without having to parse another block that is contained in the full message. This parsing may not ever be necessary if the data is later serialized (like for an HTTP response), since dpack can also serialize a block directly from its mapped data without having to re-parse and serialize.

### Blocks in Streams
Again, blocks can be reserialized directly from their mapped binary or string data without needing to be parsed, if they have not been accessed or modified. Expanding on the previous example:
```
if (parsed.category == 'Small data') {
	serialize(parsed); // original source binary data is used to serialize
}
```
Data from blocks can also be modified, which will indicate that it would need to be re-serialized:
```
parsed.newData = 'something new';
serialize(parsed);
```
In this case, the data in the root block has changed, and so it needs to be reserialized. However, the embedded `bigData` object has not changed and does not require any parsing or serialization.

However, some care must be take if you are modifying sub-objects, as these will notify the block proxy of changes. For example, if instead we change a sub-object:
```
parsed.smallObject.changed = 'something new';
```
The `parsed` object won't have any property changes. You should re-set the property on the parent object so the change is recorded (and it knows to reserialize):
```
let smallObject = parsed.smallObject;
smallObject.changed = 'something new';
parsed.smallObject = smallObject;
```

## Specification
While the dpack specification requires somewhat complicated description, it is designed for ease of creating high performance implementations, and making it easy to use fast bitwise operators, and memory-limited structures.

dpack is a binary data format, in the sense that structures are defined through byte-level tokens for machine parsing, it is generally specified as character-based format; blocks of data can be entirely decoded using a character set decoding, and then the parsing rules operate on the decoded characters. dpack is optimized for, should default to, UTF-8 encoding, but could be encoded in any character set that can encode unicode charaters 0-127. In addition, it can be encoded using additional characters for more efficient space usage when encoded in UTF-16.

The basic entity in a dpack message is a token. A token may consist of 1 to 8 characters. The meaning of the characters in a token are determine by their unicode code point number, and further defined by bitwise positions. All token characters should be converted to a character code. The token character or characters are used to determine a `type` number from 0 to 3, and an `accompanying` number which is an unsigned integer up to 2^46. A dpack serialized data structure consists entirely of tokens and strings that are read by length specified by tokens, based on the parsing rules.

By default, all token character bytes have an initial 0 bit (if 0 - 127 byte range is used). The second bit is always a "stop" bit. A one means this is the last byte, a zero means additional bytes are part of the token. In the first byte, The next two bits (3rd and 4th) represent the `type` of the token. The remaining bits, the first four bits of the first byte, and all remaining bytes (up to and including a byte with a stop bit) are used to serialize the accompanying number, which is interpreted by big endian bytes/bits, where the first bits are most significant, and later bytes/bits are less significant.
For example:
Character "R": Code point 82. Binary representation:
0 1 0 1 0 0 1 0 - Stop bit is set (1), type (0 1) is 1, and accompanying number (0 0 1 0) is 2.
Character "!D": Code points 33 and 68. Binary representation:
0 0 1 0 0 0 0 1   0 1 0 0 0 1 0 0 - Stop bit is not set (0), type (1 0) is 2, bits (0 0 0 1) will be combined with next byte. Next byte, stop bit is set. Combined bits (0 0 0 1  0 0 0 1 0 0) make 68 the accompanying number.

There may be up to 8 bytes, which accomodates up to 46 bits for the accompanying number, therefore the accompanying number must be an unsigned integers under 2^46.

Some types will use the accompanying number to specify the length of a string immediately following the block. When a string is to be read, the number specifies the number of characters to be including in the string, after which the next block can be immediately read. The length of the string is not bytes, but basic multiplane characters. Any supplemental plane should be counted as two characters (surrogates) should be counted as two characters (a pair). In other words, a string length is defined by its UTF-16 encoding (though it may be serialized in UTF-8 in dpack).

dpack has four different reading modes, based on what type of data is being read. Parsing should always start in the open mode, the default reading mode. Each of the reading modes is described below, and the `type` from each token is combined with the accompanying to determine what value is being parsed next based on the reading mode.

## Type and Reading Mode
The `type` is combined with the reading mode to determine the type of the value being parsed. The following reading modes and types are specified. Again, parsing should always start in open mode:

### Open Mode
In open mode, `type` is interpreted as:
type 0: The value is determined by the accompanying number:
	0 - null
	1 - false
	2 - true
	3 - undefined

	5 - object - Read the next token in object mode and return it.
	6 - string - Read the next block in string mode and return it.
	7 - open - Read the next block in open mode (no-op) and return it.
	8 - extended type - read the next block in open mode to determine type, and read the next block using the extension reader.
	12 - Value with identifier. Read the next entity as a number, in open mode, to determine the id, and the next data value in open mode to determine the value/object to associate with the id.
	13 - Begin document and define length in bytes of the next section data. Read the next block in open mode as a number to determine length, and then the next block after that in open mode to determine value
	14 - End document
	15 - Library import

type 1: The accompanying number is the actual parsed value (an unsigned integer).
type 2: The accompanying number is the length of the subsequent string, which should be serialized as a number. For example, the following string could be "-2.32". This string should parsed as a number according to standard Java/C/JavaScript number rules. This can also be "Infinity" or "-Infinity".
type 3: Parsed value is an array of values, each to be successively read in open mode. The accompanying number specifies the number of values in the array.

### Structured Object Mode
In object mode, `type` is interpreted:
type 0 - Object identify/reference - Identifies this objects, connecting it to an identity, that may be defined or used elsewhere. The next block should be read in object mode to read any properties assigned to it immediately.
type 1 - Object with inline property structure. An structured object is serialized and will be parsed by first reading a structure definition of the properties, and then the values of the property. The accompanying number defines the number of properties (and values). The property structure is parsed in property mode, with the given number of properties, which define the property names and types that will be created on the parsed object. This is followed by the property values, in the same order and position as the property definitions. The corresponding property definition defines which read mode to use for each value (i.e. if the first property defines string type, the first value should be read in string mode).
type 2 - Object with structure reference. The accompanying number is a reference to a previously defined property structure. The structure reference is followed by the values to parsed and assigned to the object based on the position and type as defined in the referenced structure. The referenced structure is a back-reference, and is found by counting sequentially in reverse through the dpack document/file/stream by the inline-defined structures. For example, if the accompanying number is 1, then the last (most recently) defined property structure before this point in the document, is the referenced structure. A number of 2 would be the second to last (0 never used as a back-reference, it should be parsed as null).
type 3: An array of objects, each to be successively read in object mode. The accompanying number specifies the number of objects in the array.

### String Mode
In string mode, `type` is interpreted:
0: inline string, non-referenceable
1: inline string, referenceable
2: string back reference
type 3: An array of strings, each to be successively read in string mode. The accompanying number specifies the number of strings in the array.
string length = num

### Property Mode:
In property mode, `type` is interpreted:
0: property reference
1: object type with string key (value defines string length)
2: string type...
3: open type...


<a href="https://dev.doctorevidence.com/"><img src="./assets/powers-dre.png" width="203" /></a>
