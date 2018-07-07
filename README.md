<a href="https://dev.doctorevidence.com/"><img src="./assets/powers-dre.png" width="203" /></a>

DPack is object format that provides more compact encoding and faster decoding than JSON and other formats. DPack has several key features:
* Uses internal structural, property, value references for compact encoding and fast decoding.
* Defined such that encoded data is also a valid UTF-8 encoding (or any other ASCII-compatible encoding), which allows for single-pass text decoding for faster and simpler decoding (particulary in browser)
* Supports streaming, progressive decoding.
* Supports positional object properties for lazy evaluation of paths for faster access to data from databases.
* Encode numbers in decimal for no precision lost.

MessagePack codec/extension for documents, an object or array that contains reusable structures/templates for more efficient, compact, faster encodings, and for lazy parsing.


## Specification
The basic entity in the DPack is a block which consists of a `type` which consists of 2 bit (unsigned) integer and an accompanying number which consists of up to 40 bit (unsigned) integer. This is encoded with 1 to 6 bytes. All bytes have an initial 0 bit (only 0 - 127 byte range are used). The second bit is always a "stop" bit. A one means this is the last byte, a zero means additional bytes are part of the block. In the first byte, The next two bits (3rd and 4th) represent the `type` of the block. The remaining bits, the first four bits of the first byte, and all remaining bytes (up to and including a byte with a stop bit) are used to encode the accompanying number, which is interpreted by big endian bytes/bits.
For example:
0 1 0 1 0 0 1 0 - Stop bit is set (1), type (0 1) is 1, and accompanying number (0 0 1 0) is 2.
0 0 1 0 0 0 0 1 - Stop bit is not set (0), type (1 0) is 2, bits (0 0 0 1) will be added to next byte:
 next: 0 1 0 0 0 1 0 0 - Stop bit is set. Combined bits (0 0 0 1  0 0 0 1 0 0) make 68 the accompanying number.

extension entity:
1 1 0 t t t t stop-bit  1 0 t t n n n n

There may be up to 8 bytes, which accomodates up to 46 bits for the accompanying number, therefore it must be an unsigned integers under 2^46.

Some types will use the accompanying number to specify the length of a string immediately following the block. When a string is to be read, the number specifies the number of characters to be including in the string, after which the next block can be immediately read. The length of the string is not bytes, but basic multiplane characters. Any supplemental plane should be counted as two characters (surrogates) should be counted as two characters (a pair). In other words, a string length is defined by its UTF-16 encoding (though it is encoded in UTF-8 in DPack).

A byte of 0 should always to decoded as a null (in all reading modes).

## Type and Reading Mode
The `type` is combined with the reading mode to determine the type of the value being decoded. The following reading modes and types are specified. Decoding should always start in open mode:

### Open Mode
In open mode, `type` is interpreted:
type 0: The value is determined by the accompanying number:
	0 - null
	1 - false
	2 - true
	3 - undefined
	4 - NaN
	5 - Infinity
	6 - -Infinity

	8 - object - read the next block in object mode
	9 - string - read the next block in string mode
	10 - date - next block is a number (read in open mode) as date in epoch milliseconds
	11 - Map (read next block as array in open mode for keys, next block again as array in open mode for values)
	12 - Set (read next block as array in open mode)
	13 - Value with length defined. Read the next block in open mode as a number to determine length, and then the next block after that in open mode to determine value
	14 - Object with referenceable id (read the next block as a number to determine the id, and the next block in open mode)
	15 - binary (base 64) (next block is read in string mode as a base 64 string to be decoded as a binary struture)
	... - extensions
	15 - gzip

type 1: The accompanying number is the actual decoded value (an unsigned integer)
type 2: The accompanying number is the length of as string, which should be parsed as a number. For example, a string could be "-2.32".
type 3: And array of values, each to be successively read in open mode. The accompanying number specifies the number of values in the array.
4(8): object (read next block in object mode) with metadata
5(9): string (read next block in string mode) with metadata
6(10): open (read next block in open mode) with metadata

### Object Mode
In object mode, `type` is interpreted:
type 1 - Object with inline property structure. An object/map is encoded and will be decoded by first reading a structure definition of the properties, and then the values of the property. The accompanying number defines the number of properties (and values). The property structure is decoded in property mode, with the given number of properties, which define the property names and types that will be created on the decoded object. This is followed by the property values, in the same order and position as the property definitions. The corresponding property definition defines which read mode to use for each value (i.e. if the first property defines string type, the first value should be read in string mode).
type 0 - Object with structure reference. The accompanying number is a reference to a previously defined property structure. The structure reference is followed by the values to decoded and assigned to the object based on the position and type as defined in the referenced structure. The referenced structure is a back-reference, and is found by counting sequentially in reverse through the DPack document/file/stream by the inline-defined structures. For example, if the accompanying number is 1, then the last (most recently) defined property structure before this point in the document, is the referenced structure. A number of 2 would be the second to last (0 never used as a back-reference, it should be decoded as null).
type 2 - object special - quick reference < 16 - >= 16 -
	16 => object references
type 3: And array of objects, each to be successively read in object mode. The accompanying number specifies the number of objects in the array.


### String Mode
In string mode, `type` is interpreted:
0: string back reference
1: inline string
2: reserved
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



utf-8 encoding vs ascii-only encoding
utf-8 encoding
faster large number reading
more bits for single byte encoding
7, 11, 16, 21

ascii-only
better huffman encoding
allow for alternate character encodings
more bits for multi-byte encoding
could use utf-8 as an escape
simpler binary level specification
6, 12, 18, 24

utf-8 with 2 byte cutoff
double byte less bits, but quadruple bits
7, 10, 16, 22
