# DPack

DPack is a very compact binary format for serializing data structures, designed for efficient, high-performance serialization/parsing, with a broad range of data types, and optimized for web use. For common large data structures in applications, a dpack file is often much smaller than JSON (and much smaller than MsgPack as well), and can be parsed faster than JSON and other formats. DPack leverages structural reuse to reduce size. Size and performance differences can very significantly depending the on the size, homogeneity, and structure of the incoming data, but in our measurements across different applications we often see 3 to 5 times smaller files for large structures like our study data or Jira issue lists, but very small objects might see little changes. Likewise, dpack may perform 2 to 3 times as fast as JSON parser for large data structures with consistent object structures, but may have little difference or slower in very small or unpredictable data structures. DPack has several key features:
* Uses internal referencing and reuse of properties, values, and objects for very compact serialization and fast parsing.
* Defined as a valid unicode character string, which allows for single-pass text decoding for faster and simpler decoding (particulary in browser), support across older browsers, and ease of manipulation as a character string. It can also be encoded in UTF-8, UTF-16, or any ASCII compatible encoding.
* Supports a wide range of types including strings, decimal-based numbers, booleans, objects, arrays, dates, maps, sets, and user-provided classes/types.
* Supports separable blocks of object properties for lazy evaluation of paths for faster access to data without parsing entire data structures (useful for efficient and scalable storing, querying, and indexing data in databases).
* Supports referencing of objects and values which can be used advanced serialization and reuse of objects.
* Optimized to compress well with Huffman/Gzip encoding schemes.

In addition this dpack library features:
* Streaming, progressive parsing in the browser, so data can be parsed during download instead of waiting until it completed.
* Asynchronous, progressive streaming of data from Node, utilizing back-pressure to load and stream data while miminizing memory/resource consumption, with support for lazy-loaded resources.
* Support for Proxy-based blocks for lazy parsing and copy-on-write modifications with efficient serialization reuse.
* Browser modules less than 18KB minimized (6KB gzipped).

## Intended Use

DPack is designed for very compact serialization and fast parsing with a wide range of types and encodings to support a broad range of applications, including efficient database storage, and efficient network data transfer. However, there are some caveats to consider. DPack leverage reuse of data property definitions to acheive its compact format. For very small data structures, or data structures with very little structural consistency, dpack's advantages may be minimized or non-existent. However, for applications with larger data structures with internal consistency, with the entire process of serialization, compression, caching, network transfer, decoding, and progressive parsing taken into consideration, dpack can provide substantial performance benefits.

# Using DPack

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
The `serialize` function accepts a value (object, array, string, etc.), and will return a `Buffer` in NodeJS or a string in the browser. The `parse` function accepts a string or Buffer and returns the parsed data. The following types of data can be serialized, and parsed back into the same type:
* Objects - Any plain object
* Arrays
* Strings
* Numbers
* Boolean
* null
* Map
* Set
* Date
* User added types (see section below)

## Loading Data in the Browser
This dpack library also supports progressive parsing by augmenting the `XMLHttpRequest` and `fetch` APIs. These loading features means that dpack will parse messages *while* they are downloading. For large data structures, an application doesn't have to wait for an entire resource download to complete before starting an additional expensive step of parsing, but by the time the last byte comes in, most of the file will have already been parsed. The progressively parsed data is also available for interaction during download. To use progressive parsing with `XMLHttpRequest`, use the dpack provided version. You can access the data that has been parsed so far during `progress` events, on the `responseParsed` property. For example, one could show list of all the items in your data structure that have been downloaded, or count the items to show a progress bar:
```
const { XMLHttpRequest } = require('dpack');
var xhr = new XMLHttpRequest();
xhr.open('GET', 'my/dpack-data', true);
xhr.send();
xhr.addEventListener('progress', () => {
	var partialData = xhr.responseParsed; // all the data that has been downloaded so far is parsed is accessible here as it downloads
});
xhr.addEventListener('load', ()  => {
	var data = xhr.responseParsed; // finished downloading, full data available
});
```
Likewise, you can also use the dpack augmented `fetch` API. Note, that this is not a polyfill itself (although it can be used with a polyfill), this will only work if there is an existing `fetch` global to extend. The dpack augmented `fetch` will have a `dpack` method on the `Response` object that can be used to progressively parse, track progress and return the fully parsed data once completed. The `dpack` method will accept an optional progress callback that will be called as data is received and parsed. The same example using the `fetch` API with dpack:
```
const { fetch } = require('dpack');
fetch('my/dpack-data').then(response => response.dpack((partialData) => {
	// all the data that has been downloaded so far is parsed, and accessible here as it downloads
})).then(data => {
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
		this.target = target;
	}
	printGreeting() {
		console.log('Hello, ' + this.target);
	}
}
let options = new Options();
options.addExtension(Greeting);
let serialized = serialize({ myGreeting: new Greeting('World')}, options);
let data = parse(serialized, options);
data.myGreeting.printGreeting(); // prints "Hello, World"
```

## Streams
The dpack library provides Node transforming streams for streamed parsing and serialization of data. To create a serializing stream, and write a data structure, you can write:
```
const { createSerializeStream } = require('dpack');
var stream = createSerializeStream();
stream.pipe(targetStream); // this could be an HTTP response, or other network stream
stream.write(data); // write a data structure, and it will be serialized, with more to come
stream.end(data); // write a data structure, and it will be serialized as the last data item.
```
Likewise, we can read do streamed parsing:
```
const { createParseStream } = require('dpack');
var stream = createParseStream();
inputStream.pipe(stream); // this could be an HTTP request, WebSocket, or other incoming network stream
stream.on('data', (data) => {
	// when data is received
});
```
Note that DPack can more efficiently stream data if it is the last data, through the `end(data)` call, and that should generally be used unless multiple blocks need to be sent.

### Asynchronous/Lazy Streaming
A serializing stream can also stream data structures that may contain embedded data that is asynchronously or lazily loaded. This can be a powerful way to leverage Node's backpressure functionality to defer loading embedded data until network buffers are ready to consume them. This is accomplished by including `then`able data. A promise can be included in your data, or custom `then`able. For example:
```
var stream = createSerializeStream();
var responseData = {
	someData: fetch('/some/url') // when serializing, dpack will pause at this point, and wait for the promise to resolve
};
stream.end(data); // write the data structure (will pause as necessary for async data)
```
Here is an example of using a custom `then`-able, where dpack will wait to call `then` for each object until there is no back pressure from sending the previous object, ensuring that data is not loaded from a database until network buffers are ready to consume the data:
```
var stream = createSerializeStream();
var data = listOfDatabaseIdsToSend.map(id => {
	then(callback) {
		// this will be called by dpack when the stream is waiting for more data to send
		callback(retrieveDataFromDatabase(id)) // retrieve data from database
	}
});
stream.end(data); // write the data structure (will pause and resume data handling both async incoming data and backpressure of outgoing data)
```
Note that streamed lazy evaluation is only available for the end of the stream, you must use `stream.end` method to leverage this.

Options can also be provided as argument to `createParseStream` or `createSerializeStream`.

## Blocks
Blocks provide a mechanism for specifying a chunk of dpack data that can be parsed on-demand. A dpack file or stream can be broken up into multiple blocks that can be lazily evaluated. This can be particularly valuable for interaction with binary data from database where eagerly parsing an entire data structure may be unnecessary and expensive for querying or indexing data.

Note that lazy evaluation uses the EcmaScript `Proxy` class, which is not available in older browsers (it is intended for use in NodeJS for database purposes). However, blocks can still be read (without lazy evaluatoin) with the standard parser in all browsers.

### Lazy Parsing/Evaluation
The dpack libary supports lazy parsing using the `parseLazy` variant of `parse`. This function will return `Proxy` that is mapped to the serialized data, that will parse/evaluate the encoded data when any property is accessed:
```
const { parseLazy } = require('dpack');
var parsed = parseLazy(serializedData); // no immediate parsing, can return almost immediately
// parsed is mapped to serializedData, but won't be parsed until data is accessed:
parsed.someProperty // parsing is now performed
parsed.otherProperty // parsing has already been performed on the root block and cached
```
Blocks can be embedded in the data structure so that lazy parsing/evaluation can continue to be deferred as child objects are accessed. Blocks can be defined using the `asBlock` function:
```
const { parseLazy, serialize, asBlock } = require('dpack');
let data = asBlock({
	category: 'Small data',
	bigData: asBlock(bigDataStructure),
	smallObject: {}
});
let serialized = serialize(data);
let parsed = parseLazy(serialized); // root block is deferred
let category = parsed.category; // root block is parsed, but bigData is *not* parsed and doesn't need to be until accessed
```
Because the object in the `bigData` property has been defined in a sub-block, it does not need to be parsed until one of its properties is accessed. This separation of blocks can provide substantial performance benefits for accessing a property like `category` without having to parse another block that is contained in the full message. This parsing may not ever be necessary if the data is later serialized (like for an HTTP response), since dpack can also serialize a block directly from its mapped data without having to re-parse and serialize.

### Serializing Blocks
Again, blocks can be reserialized directly from their mapped binary or string data without needing to be parsed, if they have not been accessed or modified (and if accessed, but not modified, they don't need to be reserialized). This can provide enormous performance benefits where data stored in a database can be mapped to lazy proxies and potentially delivered to the browser without any unnecessary parsing or serialization. Expanding on the previous example:
```
if (parsed.category == 'Small data') {
	serialize(parsed); // original source binary data is used to serialize
}
```
Data from blocks can also be modified. However, by default `parseLazy` returns an immutable data structure. DPack approach to modifying data through explicit copy-on-write. So if you want a modified block, you first should get a copy of it. The copy will still use lazy evaluation and modifications will be recorded internally to track what needs to be re-serialized:
```
const { copy } = require('dpack');
let myCopy = copy(parsed);
myCopy.newData = 'something new';
serialize(parsed);
```
In this case, the data in the root block has changed, and so it needs to be reserialized. However, the embedded `bigData` object (that was copied) has not changed and does not require any parsing or serialization, and can be re-persisted or sent over a network with only the effort of re-serializing the root object.

We can even make changes to sub-objects and they will be tracked:
```
myCopy.smallObject.changed = 'something new';
```
Blocks can serialized directly with the `serialize` method or in streams as well.

## Shared Structures
DPack achieves compact representation of object structures by reusing structure and property information. Serializing small objects on their own will not have significant benefit, but this can structure/property reuse can be still be realized in a system with many smaller objects by using shared structures. A shared structure is a dpack representation of the structure/properties of objects with the same or similar structure, and the shared structure can be applied to the serialization and parsing of similar objects to yield more compact individual serializations that can then be parsed in combination with the shared structure. This can be particularly useful in a database/store where a shared structure can be associated with a table of many objects that can be serialized and parsed with their shared structure, reducing redundancy in the database.

To create a shared structure, we start with:
```
const { createSharedStructure } = require('dpack');
const sharedStructure = createSharedStructure();
```
And then serialize with it:
```
serialize(myObject, { shared: sharedStructure });
```
Using this approach, the shared structure will be generated on the fly. The serialization of `myObject` will now be dependent on the shared structure, which will be needed to parse it:
```
parse(myObject, { shared: sharedStructure });
```

However, for optimum performance, generating shared structures on the fly is usually not desirable. Ideally, we can use this to generate a shared structure, and then use the provided method to write out the common properties, and then use these pre-generated shared structure. Continuing from the example above:
```
const commonStructure = sharedStructure.serializeCommonStructure();
fs.writeFileSync('shared.dpack', commonStructure);
```
The `serializeCommonStructure` will actually look at the count of how many times properties, structures, and values are used to exclude spurious/rare properties, and provide a highly optimized shared structure. The returned `commonStructure` will be in dpack format as a buffer, and can be written to a file or database. For most database applications, we recommend actually committing it to source control, so it deterministically tracked with your code. Once this shared structure is created, we can then read it for subsequent use as a frozen shared structure that is much more performant:
```
const { readSharedStructure } = require('dpack');
const sharedStructure = readSharedStructure(fs.readFileSync('shared.dpack'));
// and now we use this shared structure for all of the objects we store in our database:
let serialized = serialize(myObject, { shared: sharedStructure })
myStore.put(key, serialized); // now store it in our database
...
let serialized = myStore.get(key);
let myObject = parse(serialized, { shared: sharedStructure });
```
Shared structures can be used in combination with blocks, and the blocks will record the shared structure that were serialized with and properly out that shared structure when serialized. For example, if we read the data as blocks:
```
let myBlock = parseLazy(serialized, { shared: sharedStructure })
```
And then serialized _without_ the shared structure, to send to an external system, the dpack serializer will recognize that the shared structure won't be used by the parser, and will automatically include it by prepending to the serialization:
```
let serialized = serialize(myBlock); // this output the concatentation of the shared structure with the block's data
```
And furthermore, the serializer is smart enough to only include the shared structure once for multiple blocks of the same type:
```
let serialized = serialize([myBlock1, myBlock2, myBlock3]);
```
In this case, the shared structure will be prepended once (in the correct location in the array), and reused for subsequent blocks that have the same shared structure. And again, the resulting serialization will be completely autonomous, it can be sent to a browser and parsed with the standard parser with no a priori knowledge of the shared structure.

## Specification
The [specification of the dpack format is available here](https://github.com/DoctorEvidence/dpack).

### gzip
One particular question in regards to data size and performance is combining serialization with gzip/deflate compression. Is dpack's compact format really helpful compared to JSON + gzip? The short answer is yes. It is true to that gzip works by eliminating much of the redundancy in JSON, which dpack also does, so a dpack message/file simply will not have as much redundancy to compress away with gzip. However, in our tests, dpack+gzip is still smaller than JSON+gzip, typically by about 10% (and also worth considering is that MsgPack+gzip is actually typically *larger* than JSON+gzip). This is because dpack is actually doing compression at a more structural level, and uses common character encodings, which actually complements gzip's string level (RLE) and byte level (Huffman encoding) compression. And furthermore, because there simply is much *less* to compress, dpack+gzip serialization/compression is usually actually *faster* than JSON+gzip serialization/compression, because dpack substantially decreases the workload of gzipping. For more performance-weighted designed, it is also worth considering using lower gzip compression level settings since the data is already much smaller (compression level like 3 or 4 instead of the default of 6), which still will provide a more compact compression than a JSON+gzip alternative, and provide even better performance.

<a href="https://dev.doctorevidence.com/"><img src="./assets/powers-dre.png" width="203" /></a>
